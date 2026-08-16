"""ADR 0001 follow-up: remap historical Document/Procedure records to Document/Form.

Before Heather's taxonomy split, Document/Procedure allocated a base NNNN and
created child Procedure Forms (-SSS). Procedure is now base-only like Standard;
Form (option value 3) carries that child-producing semantics.

This one-shot script remaps all Procedure-stamped rows to Form on:
  - enmax_autocadreservation
  - enmax_autocaddrawing
  - enmax_autocadsheet

Every historical Procedure was a form-family; new base-only Procedures are
created only after this cutover, so remapping all Procedure → Form is correct.

Usage:
    python solution/scripts/migrate_procedure_to_form.py [--dry-run] [--auth spn|device|azcli|interactive]

Prerequisites:
    Import the solution that adds Document Subtype option Form=3 before running.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import _load_env_local, _require_env, acquire_token  # noqa: E402

DOCUMENT_SUBTYPE_PROCEDURE = 2
DOCUMENT_SUBTYPE_FORM = 3

# logical name -> (entity set, primary id attribute)
ENTITIES: tuple[tuple[str, str, str], ...] = (
    ("enmax_autocadreservation", "enmax_autocadreservations", "enmax_autocadreservationid"),
    ("enmax_autocaddrawing", "enmax_autocaddrawings", "enmax_autocaddrawingid"),
    ("enmax_autocadsheet", "enmax_autocadsheets", "enmax_autocadsheetid"),
)

PAGE_SIZE = 200


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
    }


def _list_procedure_rows(
    session: requests.Session,
    base: str,
    token: str,
    entity_set: str,
    id_attr: str,
) -> list[dict]:
    url = (
        f"{base}/api/data/v9.2/{entity_set}"
        f"?$select={id_attr},enmax_acdndocumentsubtype"
        f"&$filter=enmax_acdndocumentsubtype eq {DOCUMENT_SUBTYPE_PROCEDURE}"
        f"&$top={PAGE_SIZE}"
    )
    out: list[dict] = []
    while url:
        resp = session.get(url, headers=_headers(token), timeout=120)
        if resp.status_code != 200:
            print(
                f"  ERROR GET {entity_set} → {resp.status_code}: {resp.text[:300]}",
                file=sys.stderr,
            )
            return out
        body = resp.json()
        out.extend(body.get("value", []))
        url = body.get("@odata.nextLink")
    return out


def _patch_subtype(
    session: requests.Session,
    base: str,
    token: str,
    entity_set: str,
    record_id: str,
    *,
    dry_run: bool,
) -> bool:
    if dry_run:
        print(f"  DRY-RUN PATCH {entity_set}({record_id}) → Form={DOCUMENT_SUBTYPE_FORM}")
        return True
    url = f"{base}/api/data/v9.2/{entity_set}({record_id})"
    resp = session.patch(
        url,
        headers=_headers(token),
        json={"enmax_acdndocumentsubtype": DOCUMENT_SUBTYPE_FORM},
        timeout=60,
    )
    if resp.status_code not in (204, 200):
        print(
            f"  ERROR PATCH {entity_set}({record_id}) → {resp.status_code}: {resp.text[:300]}",
            file=sys.stderr,
        )
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="List rows without updating")
    parser.add_argument(
        "--auth",
        choices=("spn", "device", "azcli", "interactive"),
        default="azcli",
    )
    args = parser.parse_args()

    _load_env_local()
    env_url = _require_env("DATAVERSE_URL").rstrip("/")
    token = acquire_token(args.auth)

    session = requests.Session()
    total = 0
    updated = 0
    failed = 0

    for logical, entity_set, id_attr in ENTITIES:
        print(f"\n== {logical} ({entity_set}) ==")
        rows = _list_procedure_rows(session, env_url, token, entity_set, id_attr)
        print(f"  Found {len(rows)} Procedure row(s)")
        for row in rows:
            rid = row.get(id_attr)
            if not rid:
                print(f"  WARN: missing {id_attr} on row keys={list(row.keys())[:8]}", file=sys.stderr)
                failed += 1
                continue
            total += 1
            if _patch_subtype(session, env_url, token, entity_set, rid, dry_run=args.dry_run):
                updated += 1
            else:
                failed += 1

    print(
        f"\nDone. candidates={total} updated={updated} failed={failed}"
        + (" (dry-run)" if args.dry_run else "")
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
