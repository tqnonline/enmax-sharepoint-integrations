"""Diagnostic: call enmax_acdnIssueNumbers directly for a reservation and watch
for drawings, surfacing the real server error the Code App swallows.

The Code App approve flow issues numbers as a non-fatal step (only console.error
on failure), so a stuck "Approved but Issue Number ????" reservation gives no
server error in the UI. This script reproduces that exact call over the Web API
and prints the full response, then polls enmax_autocaddrawings.

Usage:
    python solution/scripts/diag_issue_numbers.py --reservation RES-1051 [--auth azcli]
    python solution/scripts/diag_issue_numbers.py --reservation <guid> --count 3
    python solution/scripts/diag_issue_numbers.py --reservation RES-1051 --no-reservation-bind  # pure issuance test
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import acquire_token, _load_env_local, _require_env  # noqa: E402

API = "api/data/v9.2"
RES_ENTITY = "enmax_autocadreservations"
DRAWING_ENTITY = "enmax_autocaddrawings"

# Six composition lookups -> (navigation property PascalCase, lookup entity set)
COMPOSITION = [
    ("Business", "enmax_acdnBusiness", "enmax_autocadbusinesses"),
    ("Asset",    "enmax_acdnAsset",    "enmax_autocadassets"),
    ("Unit",     "enmax_acdnUnit",     "enmax_autocadunits"),
    ("Domain",   "enmax_acdnDomain",   "enmax_autocaddomains"),
    ("System",   "enmax_acdnSystem",   "enmax_autocadsystems"),
    ("Kind",     "enmax_acdnKind",     "enmax_autocadkinds"),
]


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
    }


def resolve_reservation(session, base, token, ident):
    """Return (guid, dict of composition codes, count) for a RES-xxxx number or GUID."""
    expand = ",".join(f"{nav}($select=enmax_acdncode)" for _, nav, _ in COMPOSITION)
    select = "enmax_autocadreservationid,enmax_acdnreservationid,enmax_acdnstatus,enmax_acdndrawingcount,enmax_acdnissuednumbers,enmax_acdnreservationtype,enmax_acdndocumentsubtype"

    is_guid = "-" in ident and len(ident) >= 32 and not ident.upper().startswith("RES")
    if is_guid:
        url = f"{base}/{API}/{RES_ENTITY}({ident})?$select={select}&$expand={expand}"
        resp = session.get(url, headers=_headers(token), timeout=60)
        rows = [resp.json()] if resp.status_code == 200 else []
    else:
        url = (
            f"{base}/{API}/{RES_ENTITY}"
            f"?$select={select}&$expand={expand}"
            f"&$filter=enmax_acdnreservationid eq '{ident}'"
        )
        resp = session.get(url, headers=_headers(token), timeout=60)
        rows = resp.json().get("value", []) if resp.status_code == 200 else []

    if resp.status_code != 200:
        print(f"ERROR resolving reservation: {resp.status_code}: {resp.text[:400]}", file=sys.stderr)
        return None
    if not rows:
        print(f"ERROR: no reservation matches '{ident}'", file=sys.stderr)
        return None

    r = rows[0]
    codes = {}
    for param, nav, _ in COMPOSITION:
        obj = r.get(nav) or {}
        codes[param] = (obj.get("enmax_acdncode") or "").strip()
    return {
        "guid": r["enmax_autocadreservationid"],
        "number": r.get("enmax_acdnreservationid"),
        "status": r.get("enmax_acdnstatus"),
        "count": r.get("enmax_acdndrawingcount") or 1,
        "issued": r.get("enmax_acdnissuednumbers"),
        "type": r.get("enmax_acdnreservationtype"),
        "subtype": r.get("enmax_acdndocumentsubtype"),
        "codes": codes,
    }


def call_issue_numbers(session, base, token, res, count, bind_reservation):
    body = {
        "Business": res["codes"]["Business"],
        "Asset":    res["codes"]["Asset"],
        "Unit":     res["codes"]["Unit"],
        "Domain":   res["codes"]["Domain"],
        "System":   res["codes"]["System"],
        "Kind":     res["codes"]["Kind"],
        "Count":    int(count),
    }
    if bind_reservation:
        # Unbound Custom API EntityReference param over the Web API.
        body["Reservation"] = {
            "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocadreservation",
            "enmax_autocadreservationid": res["guid"],
        }

    url = f"{base}/{API}/enmax_acdnIssueNumbers"
    print(f"\nPOST {url}")
    print("body:", json.dumps(body, indent=2))
    resp = session.post(url, headers=_headers(token), json=body, timeout=120)
    print(f"\n-> HTTP {resp.status_code}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except Exception:
        print(resp.text[:800])
    return resp.status_code in (200, 204)


def poll_drawings(session, base, token, guid, attempts=6, delay=5):
    url = (
        f"{base}/{API}/{DRAWING_ENTITY}"
        f"?$select=enmax_acdnnumber,enmax_acdnstate,enmax_acdnreservationtype,enmax_acdndocumentsubtype"
        f"&$filter=_enmax_acdnreservation_value eq {guid}"
        f"&$orderby=enmax_acdnnumber asc"
    )
    for i in range(1, attempts + 1):
        resp = session.get(url, headers=_headers(token), timeout=60)
        rows = resp.json().get("value", []) if resp.status_code == 200 else []
        print(f"[poll {i}/{attempts}] drawings for reservation: {len(rows)}")
        for d in rows:
            print(f"   - {d.get('enmax_acdnnumber')}  state={d.get('enmax_acdnstate')}  "
                  f"type={d.get('enmax_acdnreservationtype')}/{d.get('enmax_acdndocumentsubtype')}")
        if rows:
            return True
        if i < attempts:
            time.sleep(delay)
    return False


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser(description="Diagnose IssueNumbers / drawing creation")
    parser.add_argument("--reservation", required=True, help="RES-xxxx number or reservation GUID")
    parser.add_argument("--auth", choices=["spn", "device", "azcli", "interactive"], default="azcli")
    parser.add_argument("--count", type=int, default=None, help="Override issue count (defaults to reservation drawing count)")
    parser.add_argument("--no-reservation-bind", action="store_true",
                        help="Call IssueNumbers WITHOUT the Reservation ref (pure issuance test; will NOT create drawings)")
    args = parser.parse_args()

    base = _require_env("DATAVERSE_URL").rstrip("/")
    token = acquire_token(base, args.auth)
    session = requests.Session()

    res = resolve_reservation(session, base, token, args.reservation)
    if not res:
        return 1

    print("Resolved reservation:")
    print(f"  guid    : {res['guid']}")
    print(f"  number  : {res['number']}")
    print(f"  status  : {res['status']} (2=Approved)")
    print(f"  count   : {res['count']}")
    print(f"  issued  : {res['issued']}")
    print(f"  type    : {res['type']} subtype={res['subtype']}")
    print(f"  codes   : {res['codes']}")

    missing = [k for k, v in res["codes"].items() if not v]
    if missing:
        print(f"\nWARNING: missing composition code(s): {missing} — IssueNumbers will reject.", file=sys.stderr)

    count = args.count if args.count is not None else res["count"]
    bind = not args.no_reservation_bind
    ok = call_issue_numbers(session, base, token, res, count, bind)
    if not ok:
        print("\nIssueNumbers call failed — see error above. This is the error the app swallows.", file=sys.stderr)
        return 2

    if not bind:
        print("\n(Ran without Reservation bind — numbers issued but no drawings expected.)")
        return 0

    print("\nPolling for drawings (AutoCreateDrawings is async)...")
    created = poll_drawings(session, base, token, res["guid"])
    if created:
        print("\nSUCCESS: drawings exist. The plugin chain works end-to-end.")
        return 0
    print("\nNo drawings after polling. IssueNumbers succeeded but AutoCreateDrawings "
          "did not produce rows — check the async step registration / post-image.", file=sys.stderr)
    return 3


if __name__ == "__main__":
    raise SystemExit(main())
