"""Audit / reconcile / verify reference data in a target Dataverse environment.

  --audit   : print active counts per reference table (read-only)
  (default) : deactivate reference rows whose code is NOT in the regenerated YAML
  --verify  : assert active counts match the YAML (+ system_scope 0)

Credentials via load_env(<environment>): code-app/.env.<env> or DATAVERSE_* vars.

Usage:
  uv run --with requests --with msal --with pyyaml python solution/scripts/reconcile_refdata.py \
    --environment dev [--audit | --verify] [--dry-run]
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests
import yaml

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))
from powerplatform_deploy.config import load_env          # noqa: E402
from seed import _entity_set_name, _build_headers, acquire_token, _resolve_team_id, TEAM_OWNED_TABLES  # noqa: E402

SEED_REF_DIR = SCRIPTS_DIR.parent / "seed" / "reference"
REFERENCE = ["business", "asset", "unit", "domain", "system", "kind",
             "vendor", "record_type", "record_phase"]
COMBO_EXPECT = {
    "enmax_autocadsystemscope": 0,
}


def codes_to_deactivate(dev_codes: set[str], canonical_codes: set[str]) -> set[str]:
    """Codes present in the environment but absent from the Excel-derived YAML."""
    return dev_codes - canonical_codes


def _load_doc(stem: str) -> dict:
    return yaml.safe_load((SEED_REF_DIR / f"{stem}.yaml").read_text(encoding="utf-8")) or {}


def _canonical(stem: str) -> tuple[set[str], str]:
    doc = _load_doc(stem)
    return {str(r["code"]) for r in doc.get("rows", [])}, doc["table"]


def _count(session, base, token, entity_set) -> int:
    url = f"{base}/api/data/v9.2/{entity_set}?$filter=statecode eq 0&$count=true&$top=1"
    r = session.get(url, headers=_build_headers(token))
    r.raise_for_status()
    return int(r.json().get("@odata.count", 0))


def _get_active(session, base, token, entity_set, select) -> list[dict]:
    url = f"{base}/api/data/v9.2/{entity_set}?$select={select}&$filter=statecode eq 0"
    out: list[dict] = []
    while url:
        r = session.get(url, headers=_build_headers(token))
        r.raise_for_status()
        body = r.json()
        out.extend(body.get("value", []))
        url = body.get("@odata.nextLink")
    return out


def audit(session, base, token) -> int:
    print(f"AUDIT {base}")
    for stem in REFERENCE:
        _, table = _canonical(stem)
        print(f"  {stem:<14} active={_count(session, base, token, _entity_set_name(table))}")
    for table in COMBO_EXPECT:
        print(f"  {table:<30} active={_count(session, base, token, _entity_set_name(table))}")
    return 0


def reconcile(session, base, token, dry_run) -> int:
    total = 0
    for stem in REFERENCE:
        canonical, table = _canonical(stem)
        es = _entity_set_name(table)
        id_attr = f"{table}id"
        rows = _get_active(session, base, token, es, f"{id_attr},enmax_acdncode")
        dev_codes = {str(r.get("enmax_acdncode")) for r in rows}
        stale = codes_to_deactivate(dev_codes, canonical)
        for r in rows:
            if str(r.get("enmax_acdncode")) not in stale:
                continue
            rid = r[id_attr]
            if dry_run:
                print(f"  [DRY] deactivate {stem} code={r.get('enmax_acdncode')}")
            else:
                resp = session.patch(
                    f"{base}/api/data/v9.2/{es}({rid})",
                    json={"statecode": 1, "statuscode": 2},
                    headers=_build_headers(token),
                )
                if resp.status_code not in (200, 204):
                    print(f"  ERROR {rid}: {resp.status_code} {resp.text[:200]}", file=sys.stderr)
                    continue
                print(f"  deactivated {stem} code={r.get('enmax_acdncode')}")
            total += 1
    print(f"Reconcile: {total} rows {'would be' if dry_run else ''} deactivated")
    return 0


def verify(session, base, token) -> int:
    ok = True
    for stem in REFERENCE:
        canonical, table = _canonical(stem)
        active = _count(session, base, token, _entity_set_name(table))
        good = active == len(canonical)
        ok &= good
        print(f"  {stem:<14} expect={len(canonical):<5} active={active:<5} {'OK' if good else 'FAIL'}")
    for table, exp in COMBO_EXPECT.items():
        active = _count(session, base, token, _entity_set_name(table))
        good = active == exp
        ok &= good
        print(f"  {table:<30} expect={exp:<5} active={active:<5} {'OK' if good else 'FAIL'}")
    print("VERIFY:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def reassign_owner(session, base, token, team_name) -> int:
    """Assign EVERY active row of the team-owned tables to the parent-BU team.

    Catches rows absent from the seed YAML (e.g. config keys added by other
    branches). Non-destructive: only ownerid changes; rows already owned by the
    team are skipped.
    """
    tid, err = _resolve_team_id(session, base, token, team_name)
    if err:
        print(f"ERROR: owner team '{team_name}': {err}", file=sys.stderr)
        return 1
    bind = f"/teams({tid})"
    print(f"Owner team '{team_name}' -> {tid}")
    total = 0
    for table in sorted(TEAM_OWNED_TABLES):
        es = _entity_set_name(table)
        id_attr = f"{table}id"
        fixed = 0
        url = f"{base}/api/data/v9.2/{es}?$filter=statecode eq 0"
        while url:
            r = session.get(url, headers=_build_headers(token))
            r.raise_for_status()
            body = r.json()
            for v in body.get("value", []):
                if str(v.get("_ownerid_value")) == tid:
                    continue
                rid = v[id_attr]
                resp = session.patch(
                    f"{base}/api/data/v9.2/{es}({rid})",
                    json={"ownerid@odata.bind": bind},
                    headers=_build_headers(token),
                )
                if resp.status_code not in (200, 204):
                    print(f"  ERROR {table} {rid}: {resp.status_code} {resp.text[:150]}", file=sys.stderr)
                    continue
                fixed += 1
            url = body.get("@odata.nextLink")
        if fixed:
            print(f"  {table}: reassigned {fixed}")
        total += fixed
    print(f"Reassign-owner: {total} rows reassigned to '{team_name}'")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--environment", required=True)
    ap.add_argument("--audit", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--auth",
        choices=["spn", "device", "azcli", "interactive"],
        default="spn",
        help="spn (default) or user login (device/azcli/interactive). DATAVERSE_ACCESS_TOKEN env overrides.",
    )
    ap.add_argument("--reassign-owner", action="store_true",
                    help="Assign EVERY active row of the team-owned tables to --owner-team.")
    ap.add_argument("--owner-team", default="enmax-autocad-app",
                    help="Exact team name for --reassign-owner (default enmax-autocad-app).")
    args = ap.parse_args()

    # URL from env (user-cred path: export DATAVERSE_URL) or .env.<environment> (SPN path).
    base = os.environ.get("DATAVERSE_URL", "").strip()
    if not base:
        cfg = load_env(args.environment)
        for k, v in cfg.items():
            os.environ.setdefault(k, v)
        base = os.environ["DATAVERSE_URL"]
    base = base.rstrip("/")
    print(f"ENV={args.environment}  URL={base}  auth={args.auth}")
    token = acquire_token(base, args.auth)
    session = requests.Session()

    if args.reassign_owner:
        return reassign_owner(session, base, token, args.owner_team)
    if args.audit:
        return audit(session, base, token)
    if args.verify:
        return verify(session, base, token)
    return reconcile(session, base, token, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
