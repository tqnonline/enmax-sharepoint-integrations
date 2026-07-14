"""Purge ENMAX AutoCAD transaction tables (DEV/UAT reset).

Deletes rows child-first. Never touches reference/master/config tables.

Usage:
    python solution/scripts/purge_transaction_data.py --auth azcli --dry-run
    python solution/scripts/purge_transaction_data.py --auth azcli --confirm-dev

Requires DATAVERSE_URL (or pac-selected org). Pass --confirm-dev only when the
URL host is nrg-enmax-dev.crm3.dynamics.com.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import (  # noqa: E402
    _entity_set_name,
    _load_env_local,
    _require_env,
    acquire_token,
)

# Child-first delete order (FK-safe).
PURGE_TABLES: tuple[str, ...] = (
    "enmax_autocadcheckout",
    "enmax_autocadsheet",
    "enmax_autocaddrawing",
    "enmax_autocadinappnotification",
    "enmax_autocadauditevent",
    "enmax_autocadreservation",
    "enmax_autocadnumbersequence",
)

DEV_HOST = "nrg-enmax-dev.crm3.dynamics.com"
PAGE_SIZE = 200


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
    }


def assert_dev_host(dataverse_url: str, confirm_dev: bool) -> None:
    host = dataverse_url.rstrip("/").split("//", 1)[-1].split("/", 1)[0].lower()
    if host != DEV_HOST:
        print(
            f"ERROR: purge is restricted to {DEV_HOST}; got {host}.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not confirm_dev:
        print(
            "ERROR: pass --confirm-dev to acknowledge destructive purge on ENMAX DEV.",
            file=sys.stderr,
        )
        sys.exit(1)


def delete_all_rows(
    session: requests.Session,
    base: str,
    token: str,
    table: str,
    *,
    dry_run: bool,
) -> tuple[int, int]:
    """Return (seen, deleted)."""
    entity_set = _entity_set_name(table)
    id_attr = f"{table}id"
    seen = deleted = 0
    url = f"{base}/api/data/v9.2/{entity_set}?$select={id_attr}&$top={PAGE_SIZE}"

    while url:
        resp = session.get(url, headers=_headers(token), timeout=120)
        if resp.status_code == 404:
            print(f"  {table}: entity set not found")
            return seen, deleted
        if resp.status_code != 200:
            print(
                f"  ERROR list {table} → {resp.status_code}: {resp.text[:300]}",
                file=sys.stderr,
            )
            return seen, deleted

        body = resp.json()
        rows = body.get("value", [])
        if not rows and seen == 0:
            print(f"  {table}: 0 rows")
            return 0, 0

        for row in rows:
            rid = row[id_attr]
            seen += 1
            if dry_run:
                deleted += 1
                continue
            d = session.delete(
                f"{base}/api/data/v9.2/{entity_set}({rid})",
                headers=_headers(token),
                timeout=60,
            )
            if d.status_code in (200, 204):
                deleted += 1
            else:
                print(
                    f"  ERROR DELETE {table} {rid}: {d.status_code} {d.text[:200]}",
                    file=sys.stderr,
                )

        url = body.get("@odata.nextLink")

    action = "would delete" if dry_run else "deleted"
    print(f"  {table}: {action}={deleted} (seen={seen})")
    return seen, deleted


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser(description="Purge transaction tables on ENMAX DEV")
    parser.add_argument("--dry-run", action="store_true", help="Count rows only")
    parser.add_argument(
        "--confirm-dev",
        action="store_true",
        help=f"Required to purge {DEV_HOST}",
    )
    parser.add_argument(
        "--auth",
        choices=["spn", "device", "azcli", "interactive"],
        default="azcli",
    )
    args = parser.parse_args()

    dataverse_url = _require_env("DATAVERSE_URL").rstrip("/")
    if not args.dry_run:
        assert_dev_host(dataverse_url, args.confirm_dev)
        print(f"Acquiring token (auth={args.auth})...")
        token = acquire_token(dataverse_url, args.auth)
        print("Token acquired.")
    else:
        token = ""

    session = requests.Session()
    total_seen = total_deleted = 0
    print(f"Purge transaction data on {dataverse_url}  dry_run={args.dry_run}")

    for table in PURGE_TABLES:
        seen, deleted = delete_all_rows(
            session, dataverse_url, token, table, dry_run=args.dry_run,
        )
        total_seen += seen
        total_deleted += deleted

    print(f"\nPurge complete: seen={total_seen} deleted={total_deleted}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
