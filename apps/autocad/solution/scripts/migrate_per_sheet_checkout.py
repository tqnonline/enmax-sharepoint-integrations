"""ADR 0002 migration: backfill sheet state, Standard singleton sheets, in-flight checkouts.

Phases (run in order after schema import):
  1. Backfill enmax_acdnstate on sheets where null → Available (2).
  2. Create one singleton sheet for Standard Document bases (reservationtype
     Document + subtype Standard) that have no child sheets yet — copies owner
     and denormalized taxonomy from the parent drawing.
  3. Convert in-flight drawing-level checkouts (--convert-checkouts, partial):
     links sheet-less checkout rows to a sheet when the drawing has exactly one
     sheet; multi-sheet drawings are reported for manual force-close / re-checkout.

Usage:
    python solution/scripts/migrate_per_sheet_checkout.py [--dry-run] [--auth spn|device|azcli|interactive]
    python solution/scripts/migrate_per_sheet_checkout.py --convert-checkouts [--dry-run]

Prerequisites:
    Import the Dataverse solution (enmax_acdnsheet lookup on checkout, sheet state
    column) before running. See docs/adr/0002-per-document-checkout.md.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import acquire_token, _load_env_local, _require_env  # noqa: E402

SHEET_ENTITY = "enmax_autocadsheets"
DRAWING_ENTITY = "enmax_autocaddrawings"
CHECKOUT_ENTITY = "enmax_autocadcheckouts"

SHEET_STATE_AVAILABLE = 2
SHEET_STATE_CHECKED_OUT = 3
SHEET_STATE_AWAITING_VALIDATION = 4

RESERVATION_TYPE_DOCUMENT = 2
DOCUMENT_SUBTYPE_STANDARD = 1

CHECKOUT_STATUS_OPEN = 1
CHECKOUT_STATUS_AWAITING_VALIDATION = 2
CHECKOUT_STATUS_REQUESTED = 6

ACTIVE_CHECKOUT_STATUSES = (
    CHECKOUT_STATUS_OPEN,
    CHECKOUT_STATUS_AWAITING_VALIDATION,
    CHECKOUT_STATUS_REQUESTED,
)

PAGE_SIZE = 5000


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _list_headers(token: str) -> dict[str, str]:
    """Headers for GET/list calls that need lookup annotations (e.g. ownerid logical name)."""
    h = _headers(token)
    h["Prefer"] = 'odata.include-annotations="*"'
    return h


def _checkout_status_to_sheet_state(status: int) -> int:
    if status == CHECKOUT_STATUS_OPEN:
        return SHEET_STATE_CHECKED_OUT
    if status == CHECKOUT_STATUS_AWAITING_VALIDATION:
        return SHEET_STATE_AWAITING_VALIDATION
    # Requested (6): sheet stays Available until approver grants checkout.
    return SHEET_STATE_AVAILABLE


def _owner_bind(row: dict) -> dict:
    """Build ownerid@odata.bind from a retrieved row's _ownerid_value."""
    owner_id = row.get("_ownerid_value")
    if not owner_id:
        return {}
    logical = (row.get("_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname") or "systemuser").lower()
    entity_set = "teams" if logical == "team" else "systemusers"
    return {f"ownerid@odata.bind": f"/{entity_set}({owner_id})"}


def backfill_sheet_state(session: requests.Session, base: str, token: str, dry_run: bool) -> tuple[int, int]:
    """Patch sheets with null enmax_acdnstate → Available (2). Returns (patched, errors)."""
    patched = errors = 0
    skip = 0

    while True:
        url = (
            f"{base}/api/data/v9.2/{SHEET_ENTITY}"
            f"?$select=enmax_autocadsheetid,enmax_acdnstate"
            f"&$filter=enmax_acdnstate eq null"
            f"&$top={PAGE_SIZE}"
        )
        if skip:
            url += f"&$skip={skip}"

        resp = session.get(url, headers=_headers(token), timeout=120)
        if resp.status_code != 200:
            print(f"ERROR: list sheets (null state) → {resp.status_code}: {resp.text[:400]}", file=sys.stderr)
            return patched, errors + 1

        rows = resp.json().get("value", [])
        if not rows:
            break

        for row in rows:
            sid = row["enmax_autocadsheetid"]
            if dry_run:
                print(f"[dry-run] PATCH sheet {sid} → enmax_acdnstate={SHEET_STATE_AVAILABLE}")
                patched += 1
                continue

            pr = session.patch(
                f"{base}/api/data/v9.2/{SHEET_ENTITY}({sid})",
                headers=_headers(token),
                json={"enmax_acdnstate": SHEET_STATE_AVAILABLE},
                timeout=60,
            )
            if pr.status_code in (200, 204):
                patched += 1
            else:
                print(f"ERROR: PATCH sheet {sid} → {pr.status_code}: {pr.text[:300]}", file=sys.stderr)
                errors += 1

        if len(rows) < PAGE_SIZE:
            break
        skip += PAGE_SIZE

    print(f"Sheet state backfill: {patched} patched, {errors} error(s).")
    return patched, errors


def _sheet_count(session: requests.Session, base: str, token: str, drawing_id: str) -> int:
    url = (
        f"{base}/api/data/v9.2/{SHEET_ENTITY}"
        f"?$select=enmax_autocadsheetid"
        f"&$filter=_enmax_acdndrawing_value eq {drawing_id}"
        f"&$top=1&$count=true"
    )
    resp = session.get(url, headers={**_headers(token), "Prefer": "odata.include-annotations=*"}, timeout=60)
    if resp.status_code != 200:
        return -1
    data = resp.json()
    return int(data.get("@odata.count", len(data.get("value", []))))


def create_standard_singleton_sheets(
    session: requests.Session, base: str, token: str, dry_run: bool
) -> tuple[int, int]:
    """Create one sheet per Standard Document drawing that has no sheets. Returns (created, errors)."""
    created = errors = 0
    skip = 0

    # NOTE: lookup annotations (e.g. @Microsoft.Dynamics.CRM.lookuplogicalname) are
    # NOT valid $select terms. Select the lookup value only; the annotation is returned
    # automatically via the odata.include-annotations Prefer header (see _list_headers).
    select = (
        "enmax_autocaddrawingid,enmax_acdnnumber,enmax_acdnstate,"
        "enmax_acdnreservationtype,enmax_acdndocumentsubtype,enmax_acdnsheetcount,"
        "_ownerid_value"
    )
    filt = (
        f"enmax_acdnreservationtype eq {RESERVATION_TYPE_DOCUMENT} and "
        f"enmax_acdndocumentsubtype eq {DOCUMENT_SUBTYPE_STANDARD}"
    )

    while True:
        url = f"{base}/api/data/v9.2/{DRAWING_ENTITY}?$select={select}&$filter={filt}&$top={PAGE_SIZE}"
        if skip:
            url += f"&$skip={skip}"

        resp = session.get(url, headers=_list_headers(token), timeout=120)
        if resp.status_code != 200:
            print(f"ERROR: list Standard drawings → {resp.status_code}: {resp.text[:400]}", file=sys.stderr)
            return created, errors + 1

        rows = resp.json().get("value", [])
        if not rows:
            break

        for drawing in rows:
            did = drawing["enmax_autocaddrawingid"]
            count = _sheet_count(session, base, token, did)
            if count < 0:
                print(f"ERROR: sheet count for drawing {did} failed", file=sys.stderr)
                errors += 1
                continue
            if count > 0:
                continue

            number = drawing.get("enmax_acdnnumber", did)
            sheet_state = drawing.get("enmax_acdnstate") or SHEET_STATE_AVAILABLE
            body: dict = {
                "enmax_acdnstate": sheet_state,
                "enmax_acdndrawing@odata.bind": f"/{DRAWING_ENTITY}({did})",
                "enmax_acdnreservationtype": RESERVATION_TYPE_DOCUMENT,
                "enmax_acdndocumentsubtype": DOCUMENT_SUBTYPE_STANDARD,
            }
            body.update(_owner_bind(drawing))

            if dry_run:
                print(f"[dry-run] CREATE singleton sheet for Standard drawing {number} ({did})")
                created += 1
                continue

            cr = session.post(
                f"{base}/api/data/v9.2/{SHEET_ENTITY}",
                headers=_headers(token),
                json=body,
                timeout=60,
            )
            if cr.status_code not in (200, 201, 204):
                print(
                    f"ERROR: CREATE sheet for drawing {did} → {cr.status_code}: {cr.text[:300]}",
                    file=sys.stderr,
                )
                errors += 1
                continue

            created += 1
            sheet_count = drawing.get("enmax_acdnsheetcount")
            if sheet_count != 1:
                pr = session.patch(
                    f"{base}/api/data/v9.2/{DRAWING_ENTITY}({did})",
                    headers=_headers(token),
                    json={"enmax_acdnsheetcount": 1},
                    timeout=60,
                )
                if pr.status_code not in (200, 204):
                    print(
                        f"WARN: sheet created but sheetcount patch failed for {did}: {pr.text[:200]}",
                        file=sys.stderr,
                    )

        if len(rows) < PAGE_SIZE:
            break
        skip += PAGE_SIZE

    print(f"Standard singleton sheets: {created} created, {errors} error(s).")
    return created, errors


def convert_inflight_checkouts(
    session: requests.Session, base: str, token: str, dry_run: bool
) -> tuple[int, int, int]:
    """Link sheet-less active checkouts to a sheet when unambiguous. Returns (converted, manual, errors)."""
    converted = manual = errors = 0
    skip = 0

    status_filter = " or ".join(f"enmax_acdnstatus eq {s}" for s in ACTIVE_CHECKOUT_STATUSES)
    filt = f"_enmax_acdnsheet_value eq null and ({status_filter})"

    while True:
        url = (
            f"{base}/api/data/v9.2/{CHECKOUT_ENTITY}"
            f"?$select=enmax_autocadcheckoutid,enmax_acdnstatus,_enmax_acdndrawing_value"
            f"&$filter={filt}&$top={PAGE_SIZE}"
        )
        if skip:
            url += f"&$skip={skip}"

        resp = session.get(url, headers=_headers(token), timeout=120)
        if resp.status_code != 200:
            print(f"ERROR: list in-flight checkouts → {resp.status_code}: {resp.text[:400]}", file=sys.stderr)
            return converted, manual, errors + 1

        rows = resp.json().get("value", [])
        if not rows:
            break

        for checkout in rows:
            cid = checkout["enmax_autocadcheckoutid"]
            drawing_id = checkout.get("_enmax_acdndrawing_value")
            status = checkout.get("enmax_acdnstatus", 0)

            if not drawing_id:
                print(f"MANUAL: checkout {cid} has no drawing — force-close or delete.", file=sys.stderr)
                manual += 1
                continue

            sheets_url = (
                f"{base}/api/data/v9.2/{SHEET_ENTITY}"
                f"?$select=enmax_autocadsheetid,enmax_acdnstate"
                f"&$filter=_enmax_acdndrawing_value eq {drawing_id}"
            )
            sr = session.get(sheets_url, headers=_headers(token), timeout=60)
            if sr.status_code != 200:
                print(f"ERROR: list sheets for checkout {cid} → {sr.status_code}", file=sys.stderr)
                errors += 1
                continue

            sheets = sr.json().get("value", [])
            if len(sheets) == 0:
                print(
                    f"MANUAL: checkout {cid} drawing {drawing_id} has no sheets — "
                    "run singleton creation first, then re-run --convert-checkouts.",
                    file=sys.stderr,
                )
                manual += 1
                continue

            if len(sheets) > 1:
                print(
                    f"MANUAL: checkout {cid} drawing {drawing_id} has {len(sheets)} sheets — "
                    "legacy drawing-level checkout cannot map 1:1. Options:\n"
                    "  • Force-close via enmax_acdnForceCheckin (Admin), then re-checkout per sheet.\n"
                    "  • Or split manually: close original, create one checkout per affected sheet.",
                    file=sys.stderr,
                )
                manual += 1
                continue

            sheet_id = sheets[0]["enmax_autocadsheetid"]
            target_sheet_state = _checkout_status_to_sheet_state(status)

            if dry_run:
                print(
                    f"[dry-run] PATCH checkout {cid} → sheet {sheet_id}, "
                    f"sync sheet state → {target_sheet_state}"
                )
                converted += 1
                continue

            pr = session.patch(
                f"{base}/api/data/v9.2/{CHECKOUT_ENTITY}({cid})",
                headers=_headers(token),
                json={"enmax_acdnsheet@odata.bind": f"/{SHEET_ENTITY}({sheet_id})"},
                timeout=60,
            )
            if pr.status_code not in (200, 204):
                print(f"ERROR: PATCH checkout {cid} → {pr.status_code}: {pr.text[:300]}", file=sys.stderr)
                errors += 1
                continue

            current_sheet_state = sheets[0].get("enmax_acdnstate")
            if current_sheet_state != target_sheet_state:
                sr2 = session.patch(
                    f"{base}/api/data/v9.2/{SHEET_ENTITY}({sheet_id})",
                    headers=_headers(token),
                    json={"enmax_acdnstate": target_sheet_state},
                    timeout=60,
                )
                if sr2.status_code not in (200, 204):
                    print(
                        f"WARN: checkout {cid} linked but sheet state sync failed: {sr2.text[:200]}",
                        file=sys.stderr,
                    )

            converted += 1

        if len(rows) < PAGE_SIZE:
            break
        skip += PAGE_SIZE

    print(
        f"In-flight checkout conversion: {converted} converted, "
        f"{manual} need manual follow-up, {errors} error(s)."
    )
    return converted, manual, errors


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser(description="ADR 0002 per-sheet checkout migration")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--convert-checkouts",
        action="store_true",
        help="Phase 3 only: link sheet-less active checkouts (partial — see script docstring)",
    )
    parser.add_argument(
        "--auth",
        choices=["spn", "device", "azcli", "interactive"],
        default="spn",
    )
    args = parser.parse_args()

    base = _require_env("DATAVERSE_URL").rstrip("/")
    token = acquire_token(base, args.auth)
    session = requests.Session()

    total_errors = 0

    if args.convert_checkouts:
        _, _, err = convert_inflight_checkouts(session, base, token, args.dry_run)
        return min(err, 255)

    _, err = backfill_sheet_state(session, base, token, args.dry_run)
    total_errors += err
    _, err = create_standard_singleton_sheets(session, base, token, args.dry_run)
    total_errors += err

    print(
        "\nPhase 3 (in-flight drawing checkouts) is not run by default.\n"
        "After phases 1–2, review active checkouts and run:\n"
        "  python solution/scripts/migrate_per_sheet_checkout.py --convert-checkouts [--dry-run]\n"
        "Multi-sheet drawings with a single legacy checkout require manual force-close "
        "via enmax_acdnForceCheckin before per-sheet re-checkout."
    )
    return min(total_errors, 255)


if __name__ == "__main__":
    raise SystemExit(main())
