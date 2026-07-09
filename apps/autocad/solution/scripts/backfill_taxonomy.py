"""WS6 additive backfill: set Reservation Type=Drawing on legacy reservations.

Idempotent — only patches rows where enmax_acdnreservationtype is null.
Document Subtype stays null for Drawing rows (Standard/Procedure apply only to Document).

Usage:
    python solution/scripts/backfill_taxonomy.py [--dry-run] [--auth spn|device|azcli|interactive]
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import acquire_token, _load_env_local, _require_env  # noqa: E402

RESERVATION_ENTITY = "enmax_autocadreservations"
DRAWING_TYPE = 1
PAGE_SIZE = 5000
RESERVATION_TYPE_ATTR = "enmax_acdnreservationtype"


def _missing_attribute_hint(resp_text: str) -> str | None:
    if RESERVATION_TYPE_ATTR not in resp_text and "0x80060888" not in resp_text:
        return None
    return (
        f"\nThe attribute '{RESERVATION_TYPE_ATTR}' is not in this environment yet.\n"
        "Re-import the Dataverse solution (additive upgrade), then re-run backfill:\n"
        "  python solution/scripts/pack.py\n"
        "  python solution/scripts/import.py\n"
        "  python solution/scripts/patch_optionsets.py --auth azcli\n"
        "Or: IMPORT_SOLUTION=1 ./scripts/deploy-user-dev.sh\n"
    )


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
    }


def backfill(session: requests.Session, base: str, token: str, dry_run: bool) -> int:
    """Patch reservations missing enmax_acdnreservationtype. Returns error count."""
    errors = 0
    skip = 0
    patched = 0

    while True:
        url = (
            f"{base}/api/data/v9.2/{RESERVATION_ENTITY}"
            f"?$select=enmax_autocadreservationid,{RESERVATION_TYPE_ATTR}"
            f"&$filter={RESERVATION_TYPE_ATTR} eq null"
            f"&$top={PAGE_SIZE}"
        )
        if skip:
            url += f"&$skip={skip}"

        resp = session.get(url, headers=_headers(token), timeout=120)
        if resp.status_code != 200:
            hint = _missing_attribute_hint(resp.text)
            print(f"ERROR: list reservations → {resp.status_code}: {resp.text[:400]}", file=sys.stderr)
            if hint:
                print(hint, file=sys.stderr)
            return errors + 1

        rows = resp.json().get("value", [])
        if not rows:
            break

        for row in rows:
            rid = row["enmax_autocadreservationid"]
            patch_url = f"{base}/api/data/v9.2/{RESERVATION_ENTITY}({rid})"
            body = {"enmax_acdnreservationtype": DRAWING_TYPE}

            if dry_run:
                print(f"[dry-run] PATCH {rid} → {RESERVATION_TYPE_ATTR}={DRAWING_TYPE}")
                patched += 1
                continue

            pr = session.patch(patch_url, headers=_headers(token), json=body, timeout=60)
            if pr.status_code in (200, 204):
                patched += 1
            else:
                print(f"ERROR: PATCH {rid} → {pr.status_code}: {pr.text[:300]}", file=sys.stderr)
                errors += 1

        if len(rows) < PAGE_SIZE:
            break
        skip += PAGE_SIZE

    print(f"Backfill complete: {patched} reservation(s) set to Drawing (type={DRAWING_TYPE}), {errors} error(s).")
    return errors


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser(description="WS6 taxonomy backfill")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--auth",
        choices=["spn", "device", "azcli", "interactive"],
        default="spn",
    )
    args = parser.parse_args()

    base = _require_env("DATAVERSE_URL").rstrip("/")

    # Dry-run still lists live rows — a bearer token is required for reads.
    token = acquire_token(base, args.auth)

    session = requests.Session()
    return backfill(session, base, token, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
