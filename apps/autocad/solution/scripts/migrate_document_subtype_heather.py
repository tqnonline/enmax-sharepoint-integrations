"""Heather taxonomy remumber migration (docs/drawing-document-subtype-CONTRACT.md).

Before this migration, enmax_acdndocumentsubtype used Standard=1, Procedure=2,
Form=3 (Drawing-type rows had subtype null/unset). The option set has been
remapped to: 1 Drawing Document, 2 Drawing, 3 Standard Document, 4 Procedure,
5 Form — so every historical row must be re-stamped to the new integers:

  Document (enmax_acdnreservationtype=2): Form 3->5, Procedure 2->4, Standard 1->3
  Drawing  (enmax_acdnreservationtype=1): subtype null/0 -> 2 (Drawing)

Remap order matters WITHIN a run: Form must move off value 3 before Standard
claims it, and Procedure moves off 2 before anything could land there. Running
the Document steps in Form, Procedure, Standard order (i.e. descending old
value) makes a single pass safe.

Idempotency (running this script twice) is subtler: Form's OLD trigger value
(3) is numerically identical to Standard's NEW value (3), since both are
reservationtype=2. A second blind pass over "subtype eq 3" would therefore
re-migrate already-correct Standard rows into Form. This script guards against
that by probing, per table, which of {1, 2, 4, 5} are present before touching
anything:
  - any 4 or 5 present  -> already migrated; skip the whole Document cascade.
  - any 1 or 2 present  -> not yet (fully) migrated; safe to run all 3 steps.
  - only 3 present      -> ambiguous (could be un-migrated Form or already-
    migrated Standard); skip the Form step only and warn rather than guess.
  - none present        -> nothing to do either way; run is a no-op.
Standard (old=1) and Procedure (old=2) never collide with any new-scheme
terminal value for reservationtype=2, so they are always safe to run.

The Drawing null/0 -> 2 step has no such ambiguity: null/0 was never a valid
Drawing subtype pre-cutover, and once patched to 2 it will never match the
null/0 filter again.

Usage:
    python solution/scripts/migrate_document_subtype_heather.py --dry-run
    python solution/scripts/migrate_document_subtype_heather.py --auth azcli --confirm-dev-uat

Prerequisites:
    Import the solution that remaps the enmax_acdn_documentsubtype option set
    (1 Drawing Document, 2 Drawing, 3 Standard Document, 4 Procedure, 5 Form)
    before running.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import _load_env_local, _require_env, acquire_token  # noqa: E402

RESERVATION_TYPE_DRAWING = 1
RESERVATION_TYPE_DOCUMENT = 2

# (old_subtype, new_subtype, label) for Document-type rows, in the required
# execution order (descending old value — see module docstring).
DOCUMENT_SUBTYPE_REMAP: tuple[tuple[int, int, str], ...] = (
    (3, 5, "Form"),
    (2, 4, "Procedure"),
    (1, 3, "Standard"),
)

DRAWING_SUBTYPE_DRAWING = 2

# logical name -> (entity set, primary id attribute)
ENTITIES: tuple[tuple[str, str, str], ...] = (
    ("enmax_autocadreservation", "enmax_autocadreservations", "enmax_autocadreservationid"),
    ("enmax_autocaddrawing", "enmax_autocaddrawings", "enmax_autocaddrawingid"),
    ("enmax_autocadsheet", "enmax_autocadsheets", "enmax_autocadsheetid"),
)

PAGE_SIZE = 200

DEV_HOST = "nrg-enmax-dev.crm3.dynamics.com"

SUBTYPE_FIELD = "enmax_acdndocumentsubtype"
RESERVATION_TYPE_FIELD = "enmax_acdnreservationtype"


# ---------------------------------------------------------------------------
# Pure remap logic (unit-testable without Dataverse access)
# ---------------------------------------------------------------------------


def classify_document_migration_state(observed_values: set[int]) -> str:
    """Classify a table's Document-type (reservationtype=2) subtype population.

    Returns "done" (skip the whole Document cascade), "ambiguous" (skip only
    the Form step and warn), or "pending" (safe to run the full cascade).
    See module docstring for why value 3 alone is ambiguous.
    """
    if observed_values & {4, 5}:
        return "done"
    if observed_values & {1, 2}:
        return "pending"
    if 3 in observed_values:
        return "ambiguous"
    return "pending"


def should_run_form_step(state: str) -> bool:
    """Form (old=3) is the only step at risk of re-matching an already-migrated
    Standard row (new=3); every other state is safe to run it."""
    return state == "pending"


def document_subtype_target(current_subtype: int | None) -> int | None:
    """Target enmax_acdndocumentsubtype for a Document-type row, or None if the
    current value doesn't match any pending remap step (already migrated or
    not a recognized old value)."""
    for old_value, new_value, _label in DOCUMENT_SUBTYPE_REMAP:
        if current_subtype == old_value:
            return new_value
    return None


def drawing_subtype_target(current_subtype: int | None) -> int | None:
    """Target subtype for a Drawing-type row, or None if it already has one
    (no change needed — idempotent by construction, see module docstring)."""
    if current_subtype is None or current_subtype == 0:
        return DRAWING_SUBTYPE_DRAWING
    return None


def is_dev_or_uat_host(host: str) -> bool:
    host = host.strip().lower()
    return host == DEV_HOST or "-uat." in host or host.startswith("uat.")


def host_from_url(dataverse_url: str) -> str:
    return dataverse_url.rstrip("/").split("//", 1)[-1].split("/", 1)[0].lower()


# ---------------------------------------------------------------------------
# Dataverse REST helpers
# ---------------------------------------------------------------------------


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
    }


def _document_filter(subtype_value: int) -> str:
    return f"{RESERVATION_TYPE_FIELD} eq {RESERVATION_TYPE_DOCUMENT} and {SUBTYPE_FIELD} eq {subtype_value}"


def _drawing_null_or_zero_filter() -> str:
    return (
        f"{RESERVATION_TYPE_FIELD} eq {RESERVATION_TYPE_DRAWING} and "
        f"({SUBTYPE_FIELD} eq null or {SUBTYPE_FIELD} eq 0)"
    )


def _any_rows(session: requests.Session, base: str, token: str, entity_set: str, filt: str) -> bool:
    url = f"{base}/api/data/v9.2/{entity_set}?$select={SUBTYPE_FIELD}&$filter={filt}&$top=1"
    resp = session.get(url, headers=_headers(token), timeout=60)
    if resp.status_code != 200:
        print(f"  ERROR probe {entity_set} → {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
        return False
    return bool(resp.json().get("value"))


def _observed_document_subtypes(
    session: requests.Session, base: str, token: str, entity_set: str,
) -> set[int]:
    observed: set[int] = set()
    for value in (4, 5, 1, 2, 3):
        if _any_rows(session, base, token, entity_set, _document_filter(value)):
            observed.add(value)
    return observed


def _count_rows(session: requests.Session, base: str, token: str, entity_set: str, id_attr: str, filt: str) -> int:
    count = 0
    skip = 0
    while True:
        url = f"{base}/api/data/v9.2/{entity_set}?$select={id_attr}&$filter={filt}&$top={PAGE_SIZE}"
        if skip:
            url += f"&$skip={skip}"
        resp = session.get(url, headers=_headers(token), timeout=120)
        if resp.status_code != 200:
            print(f"  ERROR count {entity_set} → {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
            return count
        rows = resp.json().get("value", [])
        count += len(rows)
        if len(rows) < PAGE_SIZE:
            return count
        skip += PAGE_SIZE


def _patch_step(
    session: requests.Session,
    base: str,
    token: str,
    entity_set: str,
    id_attr: str,
    *,
    filt: str,
    new_value: int,
    label: str,
    dry_run: bool,
) -> tuple[int, int]:
    """Page through rows matching `filt`, patching SUBTYPE_FIELD to new_value.

    Returns (patched, errors).
    """
    patched = errors = 0
    skip = 0
    while True:
        url = f"{base}/api/data/v9.2/{entity_set}?$select={id_attr}&$filter={filt}&$top={PAGE_SIZE}"
        if skip:
            url += f"&$skip={skip}"
        resp = session.get(url, headers=_headers(token), timeout=120)
        if resp.status_code != 200:
            print(f"  ERROR list {entity_set} ({label}) → {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
            return patched, errors + 1

        rows = resp.json().get("value", [])
        if not rows:
            break

        for row in rows:
            rid = row[id_attr]
            if dry_run:
                print(f"  [dry-run] PATCH {entity_set}({rid}) → {SUBTYPE_FIELD}={new_value} ({label})")
                patched += 1
                continue
            pr = session.patch(
                f"{base}/api/data/v9.2/{entity_set}({rid})",
                headers=_headers(token),
                json={SUBTYPE_FIELD: new_value},
                timeout=60,
            )
            if pr.status_code in (200, 204):
                patched += 1
            else:
                print(f"  ERROR PATCH {entity_set}({rid}) → {pr.status_code}: {pr.text[:300]}", file=sys.stderr)
                errors += 1

        if len(rows) < PAGE_SIZE:
            break
        skip += PAGE_SIZE

    return patched, errors


def migrate_table(
    session: requests.Session,
    base: str,
    token: str,
    entity_set: str,
    id_attr: str,
    *,
    dry_run: bool,
) -> tuple[int, int]:
    """Run the full Heather cascade for one table. Returns (patched, errors)."""
    before_document = _count_rows(
        session, base, token, entity_set, id_attr,
        f"{RESERVATION_TYPE_FIELD} eq {RESERVATION_TYPE_DOCUMENT} and "
        f"({SUBTYPE_FIELD} eq 1 or {SUBTYPE_FIELD} eq 2 or {SUBTYPE_FIELD} eq 3)",
    )
    before_drawing = _count_rows(session, base, token, entity_set, id_attr, _drawing_null_or_zero_filter())
    print(f"  before: {before_document} old-scheme Document row(s), {before_drawing} null/0 Drawing row(s)")

    observed = _observed_document_subtypes(session, base, token, entity_set)
    state = classify_document_migration_state(observed)
    if state == "done":
        print("  Document cascade: already migrated (Procedure/Form new values present) — skipping")
    elif state == "ambiguous":
        print(
            "  WARNING: only subtype=3 present for Document rows — could be un-migrated Form or "
            "already-migrated Standard. Skipping the Form step; verify manually.",
            file=sys.stderr,
        )

    patched = errors = 0
    for old_value, new_value, label in DOCUMENT_SUBTYPE_REMAP:
        if label == "Form" and not should_run_form_step(state):
            continue
        p, e = _patch_step(
            session, base, token, entity_set, id_attr,
            filt=_document_filter(old_value), new_value=new_value, label=label, dry_run=dry_run,
        )
        patched += p
        errors += e

    p, e = _patch_step(
        session, base, token, entity_set, id_attr,
        filt=_drawing_null_or_zero_filter(), new_value=DRAWING_SUBTYPE_DRAWING, label="Drawing", dry_run=dry_run,
    )
    patched += p
    errors += e

    after_document = _count_rows(
        session, base, token, entity_set, id_attr,
        f"{RESERVATION_TYPE_FIELD} eq {RESERVATION_TYPE_DOCUMENT} and "
        f"({SUBTYPE_FIELD} eq 3 or {SUBTYPE_FIELD} eq 4 or {SUBTYPE_FIELD} eq 5)",
    )
    after_drawing = _count_rows(
        session, base, token, entity_set, id_attr,
        f"{RESERVATION_TYPE_FIELD} eq {RESERVATION_TYPE_DRAWING} and {SUBTYPE_FIELD} eq {DRAWING_SUBTYPE_DRAWING}",
    )
    print(f"  after:  {after_document} new-scheme Document row(s), {after_drawing} Drawing(2) row(s)")
    print(f"  {entity_set}: patched={patched} errors={errors}")
    return patched, errors


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="List rows without updating")
    parser.add_argument(
        "--confirm-dev-uat",
        action="store_true",
        help="Required (in addition to --dry-run being absent) to write on a DEV/UAT host",
    )
    parser.add_argument(
        "--auth",
        choices=("spn", "device", "azcli", "interactive"),
        default="azcli",
    )
    args = parser.parse_args()

    dataverse_url = _require_env("DATAVERSE_URL").rstrip("/")
    host = host_from_url(dataverse_url)

    if not args.dry_run:
        if not is_dev_or_uat_host(host):
            print(
                f"ERROR: this migration is restricted to DEV/UAT hosts; got '{host}'. "
                "Never run against production.",
                file=sys.stderr,
            )
            return 1
        if not args.confirm_dev_uat:
            print("ERROR: pass --confirm-dev-uat to acknowledge this write migration.", file=sys.stderr)
            return 1
    print(f"Acquiring token (auth={args.auth})...")
    token = acquire_token(dataverse_url, args.auth)
    print("Token acquired.")

    session = requests.Session()
    print(f"Heather subtype migration on {dataverse_url}  dry_run={args.dry_run}")

    total_patched = total_errors = 0
    for _logical, entity_set, id_attr in ENTITIES:
        print(f"\n== {entity_set} ==")
        patched, errors = migrate_table(session, dataverse_url, token, entity_set, id_attr, dry_run=args.dry_run)
        total_patched += patched
        total_errors += errors

    print(
        f"\nDone. patched={total_patched} errors={total_errors}"
        + (" (dry-run)" if args.dry_run else "")
    )
    return 1 if total_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
