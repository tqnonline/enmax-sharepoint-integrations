"""Seed ENMAX DEV UAT acceptance fixtures after optional transaction purge.

Loads solution/seed/uat/manifest.yaml and upserts:
  - 15 approved anchor bundles (reservation + drawing + sheets + number sequence)
  - 30 pending approval-queue reservations (5 New + 5 Append per taxonomy)

Usage:
    python solution/scripts/seed_uat_acceptance.py --auth azcli --reset --confirm-dev
    python solution/scripts/seed_uat_acceptance.py --auth azcli --confirm-dev --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

import seed  # noqa: E402
from purge_transaction_data import DEV_HOST, assert_dev_host  # noqa: E402

MANIFEST = REPO_ROOT / "solution" / "seed" / "uat" / "manifest.yaml"

RESERVATION = "enmax_autocadreservation"
DRAWING = "enmax_autocaddrawing"
SHEET = "enmax_autocadsheet"
NUMBER_SEQUENCE = "enmax_autocadnumbersequence"

RES_TYPE_DRAWING = 1
RES_TYPE_DOCUMENT = 2
SUB_STANDARD = 1
SUB_PROCEDURE = 2
SEQ_NEW = 1
SEQ_EXISTING = 2
STATUS_PENDING = 1
STATUS_APPROVED = 2
DRAWING_AVAILABLE = 1
SHEET_AVAILABLE = 2


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def load_manifest() -> dict[str, Any]:
    return yaml.safe_load(MANIFEST.read_text(encoding="utf-8")) or {}


def sequence_key(row: dict[str, Any]) -> str:
    return "-".join(
        str(row[c]).upper() if c != "unit" else str(row[c]).zfill(2)
        for c in ("business", "asset", "unit", "domain", "system", "kind")
    )


def profile_values(manifest: dict[str, Any], profile: str) -> tuple[int, int | None]:
    p = manifest["profiles"][profile]
    rt = p["reservation_type"]
    res_type = RES_TYPE_DRAWING if rt == "Drawing" else RES_TYPE_DOCUMENT
    subtype = None
    if p.get("document_subtype") == "Standard":
        subtype = SUB_STANDARD
    elif p.get("document_subtype") == "Procedure":
        subtype = SUB_PROCEDURE
    return res_type, subtype


def taxonomy_index(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for group in ("drawing", "standard", "procedure"):
        for row in manifest["taxonomy_rows"][group]:
            out[row["key"]] = {**row, "_profile": group if group != "standard" else "standard"}
    return out


def bind_lookups(row: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for short, table, entity_set in (
        ("business", "enmax_autocadbusiness", "enmax_autocadbusinesses"),
        ("asset", "enmax_autocadasset", "enmax_autocadassets"),
        ("unit", "enmax_autocadunit", "enmax_autocadunits"),
        ("domain", "enmax_autocaddomain", "enmax_autocaddomains"),
        ("system", "enmax_autocadsystem", "enmax_autocadsystems"),
        ("kind", "enmax_autocadkind", "enmax_autocadkinds"),
    ):
        code = str(row[short])
        guid = seed.deterministic_id(table, code)
        nav = {
            "business": "enmax_acdnBusiness",
            "asset": "enmax_acdnAsset",
            "unit": "enmax_acdnUnit",
            "domain": "enmax_acdnDomain",
            "system": "enmax_acdnSystem",
            "kind": "enmax_acdnKind",
        }[short]
        payload[f"{nav}@odata.bind"] = f"/{entity_set}({guid})"
    return payload


def patch_row(
    session: requests.Session,
    base: str,
    token: str,
    table: str,
    row_id,
    payload: dict[str, Any],
    dry_run: bool,
) -> bool:
    entity_set = seed._entity_set_name(table)
    url = f"{base}/api/data/v9.2/{entity_set}({row_id})"
    if dry_run:
        print(f"  [DRY-RUN] PATCH {table} {row_id}")
        return True
    resp = session.patch(url, json=payload, headers=_headers(token), timeout=60)
    if resp.status_code in (200, 204):
        return True
    print(f"  ERROR PATCH {table} {row_id}: {resp.status_code} {resp.text[:300]}", file=sys.stderr)
    return False


def seed_anchor(
    session: requests.Session,
    base: str,
    token: str,
    manifest: dict[str, Any],
    row: dict[str, Any],
    owner_bind: str,
    loaded: dict[str, dict],
    dry_run: bool,
) -> bool:
    profile_name = row.get("_profile", "drawing")
    if profile_name == "drawing":
        profile_key = "drawing"
    elif profile_name == "standard":
        profile_key = "standard"
    else:
        profile_key = "procedure"
    prof = manifest["profiles"][profile_key]
    res_type, subtype = profile_values(manifest, profile_key)
    seq = sequence_key(row)
    drawing_number = f"{seq}-0001"

    res_id = seed.deterministic_id(RESERVATION, row["key"])
    drw_id = seed.deterministic_id(DRAWING, drawing_number)

    res_payload = {
        **bind_lookups(row),
        "enmax_acdndrawingcount": 1,
        "enmax_acdnsheetsperdrawing": prof["sheets_on_anchor"],
        "enmax_acdnsequencetype": SEQ_NEW,
        "enmax_acdnreason": f"UAT anchor base for {row['key']}",
        "enmax_acdnstatus": STATUS_APPROVED,
        "enmax_acdnreservationtype": res_type,
        "enmax_acdnissuednumbers": json.dumps([1]),
        "enmax_acdnapprovedon": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ownerid@odata.bind": owner_bind,
    }
    if subtype is not None:
        res_payload["enmax_acdndocumentsubtype"] = subtype

    if not seed._upsert_row(session, base, token, RESERVATION, res_id, res_payload, dry_run):
        return False
    loaded.setdefault(RESERVATION, {})[row["key"]] = res_id

    drw_payload = {
        **bind_lookups(row),
        "enmax_acdnnumber": drawing_number,
        "enmax_acdnsequencenumber": 1,
        "enmax_acdnstate": DRAWING_AVAILABLE,
        "enmax_acdnsheetcount": prof["sheets_on_anchor"],
        "enmax_acdnreservationtype": res_type,
        "enmax_acdnReservation@odata.bind": f"/{seed._entity_set_name(RESERVATION)}({res_id})",
        "ownerid@odata.bind": owner_bind,
    }
    if subtype is not None:
        drw_payload["enmax_acdndocumentsubtype"] = subtype

    if not seed._upsert_row(session, base, token, DRAWING, drw_id, drw_payload, dry_run):
        return False
    loaded.setdefault(DRAWING, {})[drawing_number] = drw_id

    sheet_count = prof["sheets_on_anchor"]
    creates_children = profile_key in ("drawing", "procedure")
    for i in range(1, sheet_count + 1):
        if creates_children:
            filename = f"{drawing_number}-{i:03d}.pdf"
            sheet_payload = {
                "enmax_acdnDrawing@odata.bind": f"/{seed._entity_set_name(DRAWING)}({drw_id})",
                "enmax_acdnsheetnumber": i,
                "enmax_acdnstate": SHEET_AVAILABLE,
                "enmax_acdnreservationtype": res_type,
                "ownerid@odata.bind": owner_bind,
            }
        else:
            filename = f"{drawing_number}.pdf"
            sheet_payload = {
                "enmax_acdnDrawing@odata.bind": f"/{seed._entity_set_name(DRAWING)}({drw_id})",
                "enmax_acdnstate": SHEET_AVAILABLE,
                "enmax_acdnreservationtype": res_type,
                "enmax_acdndocumentsubtype": SUB_STANDARD,
                "ownerid@odata.bind": owner_bind,
            }
        if subtype is not None and creates_children:
            sheet_payload["enmax_acdndocumentsubtype"] = subtype
        sheet_id = seed.deterministic_id(SHEET, filename)
        if not seed._upsert_row(session, base, token, SHEET, sheet_id, sheet_payload, dry_run):
            return False

    ns_id = seed.deterministic_id(NUMBER_SEQUENCE, seq)
    ns_payload = {
        "enmax_acdnsequencekey": seq,
        "enmax_acdnlastissued": 1,
        "enmax_acdnseedvalue": 0,
        "ownerid@odata.bind": owner_bind,
    }
    return seed._upsert_row(session, base, token, NUMBER_SEQUENCE, ns_id, ns_payload, dry_run)


def seed_pending(
    session: requests.Session,
    base: str,
    token: str,
    manifest: dict[str, Any],
    spec: dict[str, Any],
    *,
    append: bool,
    taxonomy: dict[str, dict[str, Any]],
    loaded: dict[str, dict],
    owner_bind: str,
    dry_run: bool,
) -> bool:
    profile_key = spec["profile"]
    res_type, subtype = profile_values(manifest, profile_key)
    row = dict(spec)
    if append:
        anchor = taxonomy[spec["anchor_key"]]
        row.update({k: anchor[k] for k in ("business", "asset", "unit", "domain", "system", "kind")})

    res_id = seed.deterministic_id(RESERVATION, spec["key"])
    payload = {
        **bind_lookups(row),
        "enmax_acdndrawingcount": spec["count"],
        "enmax_acdnsheetsperdrawing": spec["sheets"],
        "enmax_acdnsequencetype": SEQ_EXISTING if append else SEQ_NEW,
        "enmax_acdnreason": (
            f"UAT add-to-existing queue item {spec['key']}"
            if append
            else f"UAT new reservation queue item {spec['key']}"
        ),
        "enmax_acdnstatus": STATUS_PENDING,
        "enmax_acdnreservationtype": res_type,
        "ownerid@odata.bind": owner_bind,
    }
    if subtype is not None:
        payload["enmax_acdndocumentsubtype"] = subtype

    # Drawing/Procedure append binds target drawing; Standard Existing does not.
    if append and profile_key in ("drawing", "procedure"):
        anchor = taxonomy[spec["anchor_key"]]
        seq = sequence_key(anchor)
        drawing_number = f"{seq}-0001"
        drw_id = loaded.get(DRAWING, {}).get(drawing_number) or seed.deterministic_id(DRAWING, drawing_number)
        payload["enmax_acdnTargetDrawing@odata.bind"] = (
            f"/{seed._entity_set_name(DRAWING)}({drw_id})"
        )

    ok = seed._upsert_row(session, base, token, RESERVATION, res_id, payload, dry_run)
    if ok:
        loaded.setdefault(RESERVATION, {})[spec["key"]] = res_id
    return ok


def resolve_owner(
    session: requests.Session,
    base: str,
    token: str,
    manifest: dict[str, Any],
    dry_run: bool,
) -> str:
    owner_cfg = manifest.get("owner", {})
    email = os.environ.get(
        owner_cfg.get("email_env", "SEED_USER_EMAIL"),
        owner_cfg.get("default_email", ""),
    ).strip()
    if dry_run and not email:
        return "/systemusers(00000000-0000-0000-0000-000000000000)"
    user_id = seed._fetch_systemuser_id(session, base, token, email)
    if not user_id:
        print(f"ERROR: owner email '{email}' not found in Dataverse.", file=sys.stderr)
        sys.exit(1)
    print(f"UAT owner: {email} -> {user_id}")
    return f"/systemusers({user_id})"


def run_purge(auth: str, dry_run: bool) -> None:
    script = REPO_ROOT / "solution" / "scripts" / "purge_transaction_data.py"
    cmd = [sys.executable, str(script), "--auth", auth, "--confirm-dev"]
    if dry_run:
        cmd.append("--dry-run")
    print("Running transaction purge...")
    subprocess.run(cmd, check=True)


def main() -> int:
    seed._load_env_local()
    parser = argparse.ArgumentParser(description="Seed UAT acceptance fixtures on ENMAX DEV")
    parser.add_argument("--reset", action="store_true", help="Purge transaction tables first")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm-dev", action="store_true")
    parser.add_argument("--auth", choices=["spn", "device", "azcli", "interactive"], default="azcli")
    args = parser.parse_args()

    manifest = load_manifest()
    dataverse_url = seed._require_env("DATAVERSE_URL").rstrip("/")
    if not args.dry_run:
        assert_dev_host(dataverse_url, args.confirm_dev)

    if args.reset:
        if args.dry_run:
            run_purge(args.auth, dry_run=True)
        else:
            run_purge(args.auth, dry_run=False)

    seed._load_option_sets()
    loaded_rows: dict[str, dict] = {}
    seed._register_reference_keys(loaded_rows)

    token = ""
    session = requests.Session()
    if not args.dry_run:
        print(f"Acquiring token (auth={args.auth})...")
        token = seed.acquire_token(dataverse_url, args.auth)
        print("Token acquired.")

    owner_bind = resolve_owner(session, dataverse_url, token, manifest, args.dry_run)
    taxonomy = taxonomy_index(manifest)
    errors = 0

    print("Seeding anchors (15)...")
    for group in ("drawing", "standard", "procedure"):
        for row in manifest["taxonomy_rows"][group]:
            row = {**row, "_profile": group}
            if not seed_anchor(session, dataverse_url, token, manifest, row, owner_bind, loaded_rows, args.dry_run):
                errors += 1

    print("Seeding pending NEW queue (15)...")
    for group in ("drawing", "standard", "procedure"):
        for spec in manifest["pending_new"][group]:
            if not seed_pending(
                session, dataverse_url, token, manifest, spec,
                append=False, taxonomy=taxonomy, loaded=loaded_rows,
                owner_bind=owner_bind, dry_run=args.dry_run,
            ):
                errors += 1

    print("Seeding pending APPEND queue (15)...")
    for group in ("drawing", "standard", "procedure"):
        for spec in manifest["pending_append"][group]:
            if not seed_pending(
                session, dataverse_url, token, manifest, spec,
                append=True, taxonomy=taxonomy, loaded=loaded_rows,
                owner_bind=owner_bind, dry_run=args.dry_run,
            ):
                errors += 1

    if errors:
        print(f"UAT seed completed with {errors} errors.", file=sys.stderr)
        return 1

    print("UAT seed completed successfully.")
    print("Expected: 45 reservations (30 Pending + 15 Approved), 15 drawings, >=15 sheets.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
