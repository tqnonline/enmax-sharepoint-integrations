"""Tests for migrate_document_subtype_heather.py.

Covers the pure remap/classification helpers directly, plus a fake-session
integration test exercising migrate_table() end-to-end: order safety (a
single run with Form/Procedure/Standard all present must not cross-
contaminate), idempotent second run (re-running must not corrupt already-
migrated Standard rows), the ambiguous-state guard, and the Drawing
null/0 -> 2 backfill. See docs/drawing-document-subtype-CONTRACT.md.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

import migrate_document_subtype_heather as mig  # noqa: E402


# ---------------------------------------------------------------------------
# Pure function tests
# ---------------------------------------------------------------------------


def test_classify_pending_when_old_standard_present() -> None:
    assert mig.classify_document_migration_state({1}) == "pending"


def test_classify_pending_when_old_procedure_present() -> None:
    assert mig.classify_document_migration_state({2}) == "pending"


def test_classify_done_when_new_procedure_present() -> None:
    assert mig.classify_document_migration_state({4}) == "done"


def test_classify_done_when_new_form_present() -> None:
    assert mig.classify_document_migration_state({5}) == "done"


def test_classify_done_wins_over_ambiguous_3() -> None:
    # 4/5 are unambiguous post-migration signals; they must take precedence
    # even if 3 (ambiguous) is also present.
    assert mig.classify_document_migration_state({3, 4}) == "done"


def test_classify_ambiguous_when_only_value_3_present() -> None:
    assert mig.classify_document_migration_state({3}) == "ambiguous"


def test_classify_pending_when_nothing_present() -> None:
    assert mig.classify_document_migration_state(set()) == "pending"


def test_should_run_form_step_only_when_pending() -> None:
    assert mig.should_run_form_step("pending") is True
    assert mig.should_run_form_step("done") is False
    assert mig.should_run_form_step("ambiguous") is False


def test_document_subtype_target_maps_old_values() -> None:
    assert mig.document_subtype_target(3) == 5  # Form
    assert mig.document_subtype_target(2) == 4  # Procedure
    assert mig.document_subtype_target(1) == 3  # Standard


def test_document_subtype_target_no_change_for_new_or_unknown_values() -> None:
    assert mig.document_subtype_target(4) is None
    assert mig.document_subtype_target(5) is None
    assert mig.document_subtype_target(0) is None
    assert mig.document_subtype_target(None) is None


def test_document_subtype_remap_order_is_descending_old_value() -> None:
    # Regression guard: Form must run before Standard claims value 3, and
    # Procedure before anything could land on 2. Reordering this tuple can
    # silently reintroduce the within-run collision described in the module
    # docstring.
    assert mig.DOCUMENT_SUBTYPE_REMAP == ((3, 5, "Form"), (2, 4, "Procedure"), (1, 3, "Standard"))


def test_drawing_subtype_target_backfills_null_and_zero() -> None:
    assert mig.drawing_subtype_target(None) == 2
    assert mig.drawing_subtype_target(0) == 2


def test_drawing_subtype_target_leaves_existing_values_alone() -> None:
    assert mig.drawing_subtype_target(1) is None  # Drawing Document — already tagged
    assert mig.drawing_subtype_target(2) is None  # already migrated


def test_is_dev_or_uat_host_accepts_known_dev_host() -> None:
    assert mig.is_dev_or_uat_host("nrg-enmax-dev.crm3.dynamics.com") is True


def test_is_dev_or_uat_host_accepts_uat_like_hosts() -> None:
    assert mig.is_dev_or_uat_host("nrg-enmax-uat.crm3.dynamics.com") is True
    assert mig.is_dev_or_uat_host("UAT.crm3.dynamics.com") is True


def test_is_dev_or_uat_host_rejects_production() -> None:
    assert mig.is_dev_or_uat_host("nrg-enmax.crm3.dynamics.com") is False
    assert mig.is_dev_or_uat_host("nrg-enmax-prod.crm3.dynamics.com") is False


def test_host_from_url_strips_scheme_and_path() -> None:
    assert mig.host_from_url("https://nrg-enmax-dev.crm3.dynamics.com/") == "nrg-enmax-dev.crm3.dynamics.com"


# ---------------------------------------------------------------------------
# Fake-session integration harness
# ---------------------------------------------------------------------------


def _eval_clause(clause: str, row: dict) -> bool:
    clause = clause.strip()
    if clause.startswith("(") and clause.endswith(")"):
        return any(_eval_clause(part, row) for part in clause[1:-1].split(" or "))
    match = re.match(r"(\w+) eq (\w+)", clause)
    assert match, f"unsupported filter clause: {clause!r}"
    field, raw_value = match.group(1), match.group(2)
    actual = row.get(field)
    if raw_value == "null":
        return actual is None
    return actual == int(raw_value)


def _eval_filter(filt: str, row: dict) -> bool:
    return all(_eval_clause(clause, row) for clause in filt.split(" and "))


def _parse_query(url: str) -> dict[str, str]:
    _, _, query = url.partition("?")
    params: dict[str, str] = {}
    for part in query.split("&"):
        if "=" in part:
            key, value = part.split("=", 1)
            params[key] = value
    return params


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    def json(self) -> dict:
        return self._payload


class _FakeSession:
    """Minimal in-memory stand-in for requests.Session against a single table.

    Rows are dicts keyed by id with real Dataverse field names
    (enmax_acdnreservationtype / enmax_acdndocumentsubtype), matching exactly
    what migrate_document_subtype_heather.py filters and patches on.
    """

    def __init__(self, rows: dict[str, dict]):
        self.rows = rows
        self.patch_calls: list[tuple[str, dict]] = []

    def get(self, url: str, headers=None, timeout=None) -> _FakeResponse:
        params = _parse_query(url)
        filt = unquote(params.get("$filter", ""))
        top = int(params.get("$top", "1000"))
        skip = int(params.get("$skip", "0"))
        select_field = unquote(params.get("$select", "id"))

        matching = [(rid, row) for rid, row in sorted(self.rows.items()) if _eval_filter(filt, row)]
        page = matching[skip: skip + top]
        value = [{select_field: rid} for rid, _row in page]
        return _FakeResponse(200, {"value": value})

    def patch(self, url: str, headers=None, json=None, timeout=None) -> _FakeResponse:
        match = re.search(r"\(([^)]+)\)$", url.split("?")[0])
        assert match, f"cannot parse id from patch url: {url!r}"
        rid = match.group(1)
        self.patch_calls.append((rid, dict(json or {})))
        if rid in self.rows and mig.SUBTYPE_FIELD in (json or {}):
            self.rows[rid][mig.SUBTYPE_FIELD] = json[mig.SUBTYPE_FIELD]
        return _FakeResponse(204, {})


def _row(reservation_type: int, document_subtype: int | None) -> dict:
    return {mig.RESERVATION_TYPE_FIELD: reservation_type, mig.SUBTYPE_FIELD: document_subtype}


ENTITY_SET = "enmax_autocadsheets"
ID_ATTR = "enmax_autocadsheetid"


def test_migrate_table_remaps_mixed_document_and_drawing_rows_without_collision() -> None:
    # Order safety: Form, Procedure, and Standard old-scheme rows all present
    # in the same table at once — none should end up at the wrong value.
    rows = {
        "std-1": _row(2, 1),
        "proc-1": _row(2, 2),
        "form-1": _row(2, 3),
        "drw-null": _row(1, None),
        "drw-zero": _row(1, 0),
    }
    session = _FakeSession(rows)
    patched, errors = mig.migrate_table(session, "https://org", "tok", ENTITY_SET, ID_ATTR, dry_run=False)

    assert errors == 0
    assert patched == 5
    assert rows["std-1"][mig.SUBTYPE_FIELD] == 3
    assert rows["proc-1"][mig.SUBTYPE_FIELD] == 4
    assert rows["form-1"][mig.SUBTYPE_FIELD] == 5
    assert rows["drw-null"][mig.SUBTYPE_FIELD] == 2
    assert rows["drw-zero"][mig.SUBTYPE_FIELD] == 2


def test_migrate_table_second_run_is_a_no_op() -> None:
    rows = {
        "std-1": _row(2, 1),
        "proc-1": _row(2, 2),
        "form-1": _row(2, 3),
        "drw-null": _row(1, None),
    }
    session = _FakeSession(rows)

    first_patched, first_errors = mig.migrate_table(session, "https://org", "tok", ENTITY_SET, ID_ATTR, dry_run=False)
    assert first_errors == 0
    assert first_patched == 4

    session.patch_calls.clear()
    second_patched, second_errors = mig.migrate_table(session, "https://org", "tok", ENTITY_SET, ID_ATTR, dry_run=False)

    assert second_errors == 0
    assert second_patched == 0
    assert session.patch_calls == []
    # Standard must still be 3 — a naive second pass would re-match Form's old
    # trigger value (3) and corrupt it to 5.
    assert rows["std-1"][mig.SUBTYPE_FIELD] == 3
    assert rows["proc-1"][mig.SUBTYPE_FIELD] == 4
    assert rows["form-1"][mig.SUBTYPE_FIELD] == 5
    assert rows["drw-null"][mig.SUBTYPE_FIELD] == 2


def test_migrate_table_ambiguous_state_skips_form_step_and_warns(capsys) -> None:
    # Only subtype=3 Document rows exist — cannot tell un-migrated Form from
    # already-migrated Standard. Must refuse to guess.
    rows = {"only-3": _row(2, 3)}
    session = _FakeSession(rows)

    patched, errors = mig.migrate_table(session, "https://org", "tok", ENTITY_SET, ID_ATTR, dry_run=False)

    assert errors == 0
    assert patched == 0
    assert rows["only-3"][mig.SUBTYPE_FIELD] == 3
    assert "verify manually" in capsys.readouterr().err.lower()


def test_migrate_table_drawing_document_subtype_one_is_never_touched() -> None:
    # Drawing Document (reservationtype=1, subtype=1) must never be swept up
    # by the Document-side Standard(1->3) step, which is scoped to
    # reservationtype=2 only.
    rows = {"dd-1": _row(1, 1)}
    session = _FakeSession(rows)

    patched, errors = mig.migrate_table(session, "https://org", "tok", ENTITY_SET, ID_ATTR, dry_run=False)

    assert errors == 0
    assert patched == 0
    assert rows["dd-1"][mig.SUBTYPE_FIELD] == 1


def test_migrate_table_dry_run_reports_without_mutating_rows() -> None:
    rows = {"std-1": _row(2, 1)}
    session = _FakeSession(rows)

    patched, errors = mig.migrate_table(session, "https://org", "tok", ENTITY_SET, ID_ATTR, dry_run=True)

    assert errors == 0
    assert patched == 1
    assert session.patch_calls == []
    assert rows["std-1"][mig.SUBTYPE_FIELD] == 1
