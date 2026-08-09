"""Recreate enmax_acdnnumber_ak as (number + documentsubtype) for type-partitioned NNNN.

ADR 0001 §3 (amended 2026-08-04): Drawing / Standard / Procedure / Form each have an
independent NNNN counter for the same coding. Displayed numbers stay
BB-AA-UU-DDD-SSS-KK-NNNN, so the same string may exist on two drawings of different
subtypes. The previous alternate key was number-only and must be replaced.

Steps:
  1. Backfill null/0 enmax_acdndocumentsubtype on drawings (Drawing family → 2).
  2. Delete enmax_acdnnumber_ak if present.
  3. Create composite AK on (enmax_acdnnumber, enmax_acdndocumentsubtype).

Solution XML and provision_schema.py already declare the composite key; this script
is required for existing environments because Dataverse does not rewrite key
attributes on import when the key SchemaName already exists.

Usage:
    python solution/scripts/migrate_type_partitioned_number_ak.py --dry-run
    python solution/scripts/migrate_type_partitioned_number_ak.py --auth azcli --confirm-dev
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from dv_cli_common import GateError, require_dev_confirm  # noqa: E402
from seed import _load_env_local, _require_env, acquire_token  # noqa: E402

TABLE = "enmax_autocaddrawing"
ENTITY_SET = "enmax_autocaddrawings"
AK_SCHEMA = "enmax_acdnnumber_ak"
AK_DISPLAY = "ENMAX Number + Document Subtype"
AK_COLUMNS = ["enmax_acdnnumber", "enmax_acdndocumentsubtype"]

DRAWING_SUBTYPE_DRAWING = 2
PAGE_SIZE = 200


def _headers(token: str, *, prefer: str | None = None) -> dict[str, str]:
    h = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def _meta_headers(token: str) -> dict[str, str]:
    h = _headers(token)
    h["Content-Type"] = "application/json; charset=utf-8"
    return h


def _lbl(text: str) -> dict:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        "LocalizedLabels": [
            {
                "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                "Label": text,
                "LanguageCode": 1033,
            }
        ],
    }


def backfill_null_subtypes(
    session: requests.Session, base: str, token: str, *, dry_run: bool,
) -> int:
    """Stamp Drawing subtype=2 where documentsubtype is null/0 (legacy Drawing rows)."""
    filter_q = (
        "(enmax_acdndocumentsubtype eq null or enmax_acdndocumentsubtype eq 0)"
        " and (enmax_acdnreservationtype eq 1 or enmax_acdnreservationtype eq null)"
    )
    url = (
        f"{base}/api/data/v9.2/{ENTITY_SET}"
        f"?$select=enmax_autocaddrawingid,enmax_acdnnumber"
        f"&$filter={filter_q}&$top={PAGE_SIZE}"
    )
    patched = 0
    while url:
        r = session.get(url, headers=_headers(token, prefer="odata.include-annotations=\"*\""))
        r.raise_for_status()
        body = r.json()
        rows = body.get("value", [])
        if not rows and patched == 0:
            print("  No drawings with null/0 documentsubtype under Drawing type.")
            return 0
        for row in rows:
            did = row["enmax_autocaddrawingid"]
            number = row.get("enmax_acdnnumber", did)
            if dry_run:
                print(f"  [dry-run] would set subtype=Drawing(2) on {number}")
            else:
                patch = session.patch(
                    f"{base}/api/data/v9.2/{ENTITY_SET}({did})",
                    headers=_headers(token),
                    json={"enmax_acdndocumentsubtype": DRAWING_SUBTYPE_DRAWING},
                )
                patch.raise_for_status()
                print(f"  Patched subtype=Drawing(2) on {number}")
            patched += 1
        url = body.get("@odata.nextLink")
    return patched


def list_keys(session: requests.Session, base: str, token: str) -> list[dict]:
    url = f"{base}/api/data/v9.2/EntityDefinitions(LogicalName='{TABLE}')/Keys"
    r = session.get(url, headers=_meta_headers(token))
    r.raise_for_status()
    return r.json().get("value", [])


def delete_key(
    session: requests.Session, base: str, token: str, metadata_id: str, *, dry_run: bool,
) -> None:
    url = (
        f"{base}/api/data/v9.2/EntityDefinitions(LogicalName='{TABLE}')"
        f"/Keys({metadata_id})"
    )
    if dry_run:
        print(f"  [dry-run] would DELETE alternate key {AK_SCHEMA}")
        return
    r = session.delete(url, headers=_meta_headers(token))
    if r.status_code not in (204, 200):
        raise RuntimeError(f"Delete key failed: {r.status_code} {r.text}")
    print(f"  Deleted alternate key {AK_SCHEMA}")
    # Entity key delete is async — wait briefly for job to clear.
    time.sleep(5)


def create_composite_key(
    session: requests.Session, base: str, token: str, *, dry_run: bool,
) -> None:
    payload = {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityKeyMetadata",
        "SchemaName": AK_SCHEMA,
        "DisplayName": _lbl(AK_DISPLAY),
        "KeyAttributes": AK_COLUMNS,
    }
    url = f"{base}/api/data/v9.2/EntityDefinitions(LogicalName='{TABLE}')/Keys"
    if dry_run:
        print(f"  [dry-run] would CREATE {AK_SCHEMA} on {AK_COLUMNS}")
        return
    r = session.post(url, headers=_meta_headers(token), json=payload)
    if r.status_code not in (204, 200, 201):
        raise RuntimeError(f"Create key failed: {r.status_code} {r.text}")
    print(f"  Created alternate key {AK_SCHEMA} on {AK_COLUMNS}")


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--auth", choices=("azcli", "env"), default="env")
    parser.add_argument(
        "--confirm-dev",
        action="store_true",
        help="Required for non-dry-run writes; Dev host only (same gate as import/purge)",
    )
    # Alias kept so older runbook snippets still work.
    parser.add_argument(
        "--confirm-dev-uat",
        dest="confirm_dev",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args()

    base = _require_env("DATAVERSE_URL").rstrip("/")
    if not args.dry_run:
        try:
            require_dev_confirm(
                base,
                confirm_dev=args.confirm_dev,
                action="migrate number alternate key",
            )
        except GateError as exc:
            print(exc.message, file=sys.stderr)
            return 2

    token = acquire_token(base, args.auth)
    session = requests.Session()

    print("\n--- Step 1: Backfill null Drawing subtypes ---")
    n = backfill_null_subtypes(session, base, token, dry_run=args.dry_run)
    print(f"  Backfill count: {n}")

    print("\n--- Step 2: Recreate alternate key ---")
    keys = list_keys(session, base, token)
    existing = next((k for k in keys if k.get("SchemaName") == AK_SCHEMA), None)
    if existing:
        attrs = existing.get("KeyAttributes") or []
        if attrs == AK_COLUMNS:
            print(f"  Already composite: {AK_SCHEMA} {attrs}")
            return 0
        print(f"  Found {AK_SCHEMA} with attributes {attrs}; replacing…")
        delete_key(session, base, token, existing["MetadataId"], dry_run=args.dry_run)
    else:
        print(f"  No existing {AK_SCHEMA}")

    create_composite_key(session, base, token, dry_run=args.dry_run)
    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
