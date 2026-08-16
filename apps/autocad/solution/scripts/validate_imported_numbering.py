#!/usr/bin/env python3
"""Validate imported sequences by creating + approving one reservation per taxonomy type.

Creates New-sequence reservations (count=1) for Drawing Document, Drawing, Standard,
Procedure — then Existing Form append — against high-water imported counter rows.
Approves via enmax_acdnApproveReservation and issues via enmax_acdnIssueNumbers
(or AddChildItems for Form). Asserts lastissued / child numbers continue.

Usage:
  DATAVERSE_URL=https://nrg-enmax-dev.crm3.dynamics.com \\
    python solution/scripts/validate_imported_numbering.py --auth azcli --confirm-dev
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from pathlib import Path

import requests

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dv_cli_common import GateError, odata_headers, require_apply_confirm  # noqa: E402
from seed import _load_env_local, _require_env, acquire_token  # noqa: E402

API = "api/data/v9.2"

# Taxonomy (Heather)
RT_DRAWING = 1
RT_DOCUMENT = 2
SUB_DRAWING_DOCUMENT = 1
SUB_DRAWING = 2
SUB_STANDARD = 3
SUB_PROCEDURE = 4
SUB_FORM = 5
SEQ_NEW = 1
SEQ_EXISTING = 2
STATUS_PENDING = 1
STATUS_APPROVED = 2

REF = {
    "Business": ("enmax_autocadbusinesses", "enmax_autocadbusinessid"),
    "Asset": ("enmax_autocadassets", "enmax_autocadassetid"),
    "Unit": ("enmax_autocadunits", "enmax_autocadunitid"),
    "Domain": ("enmax_autocaddomains", "enmax_autocaddomainid"),
    "System": ("enmax_autocadsystems", "enmax_autocadsystemid"),
    "Kind": ("enmax_autocadkinds", "enmax_autocadkindid"),
}

BINDS = {
    "Business": "enmax_acdnBusiness",
    "Asset": "enmax_acdnAsset",
    "Unit": "enmax_acdnUnit",
    "Domain": "enmax_acdnDomain",
    "System": "enmax_acdnSystem",
    "Kind": "enmax_acdnKind",
}


def _headers(token: str) -> dict[str, str]:
    return odata_headers(token)


def parse_coding(coding: str) -> dict[str, str]:
    parts = coding.upper().split("-")
    if len(parts) != 6:
        raise ValueError(f"bad coding {coding!r}")
    keys = ("Business", "Asset", "Unit", "Domain", "System", "Kind")
    return dict(zip(keys, parts))


def resolve_code_ids(session: requests.Session, base: str, token: str, codes: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for dim, code in codes.items():
        eset, id_attr = REF[dim]
        resp = session.get(
            f"{base}/{API}/{eset}",
            headers=_headers(token),
            params={
                "$select": f"{id_attr},enmax_acdncode",
                "$filter": f"enmax_acdncode eq '{code}'",
                "$top": "1",
            },
            timeout=60,
        )
        resp.raise_for_status()
        rows = resp.json().get("value", [])
        if not rows:
            raise RuntimeError(f"missing ref {dim}={code}")
        out[dim] = rows[0][id_attr]
    return out


def get_sequence(
    session: requests.Session, base: str, token: str, seq_key: str
) -> dict:
    resp = session.get(
        f"{base}/{API}/enmax_autocadnumbersequences",
        headers=_headers(token),
        params={
            "$select": "enmax_autocadnumbersequenceid,enmax_acdnsequencekey,enmax_acdnlastissued",
            "$filter": f"enmax_acdnsequencekey eq '{seq_key}'",
            "$top": "1",
        },
        timeout=60,
    )
    resp.raise_for_status()
    rows = resp.json().get("value", [])
    if not rows:
        raise RuntimeError(f"sequence not found: {seq_key}")
    return rows[0]


def pick_top_sequence(
    session: requests.Session, base: str, token: str, family: str
) -> dict:
    resp = session.get(
        f"{base}/{API}/enmax_autocadnumbersequences",
        headers=_headers(token),
        params={
            "$select": "enmax_autocadnumbersequenceid,enmax_acdnsequencekey,enmax_acdnlastissued",
            "$filter": f"endswith(enmax_acdnsequencekey,'|{family}')",
            "$orderby": "enmax_acdnlastissued desc",
            "$top": "1",
        },
        timeout=60,
    )
    resp.raise_for_status()
    rows = resp.json().get("value", [])
    if not rows:
        raise RuntimeError(f"no imported sequences for family {family}")
    return rows[0]


def create_reservation(
    session: requests.Session,
    base: str,
    token: str,
    *,
    ids: dict[str, str],
    reservation_type: int,
    document_subtype: int,
    sequence_type: int,
    count: int,
    sheets: int,
    reason: str,
    target_drawing_id: str | None = None,
) -> str:
    rid = str(uuid.uuid4())
    body: dict = {
        "enmax_autocadreservationid": rid,
        "enmax_acdndrawingcount": count,
        "enmax_acdnsheetsperdrawing": sheets,
        "enmax_acdnsequencetype": sequence_type,
        "enmax_acdnreason": reason,
        "enmax_acdnstatus": STATUS_PENDING,
        "enmax_acdnreservationtype": reservation_type,
        "enmax_acdndocumentsubtype": document_subtype,
    }
    for dim, nav in BINDS.items():
        body[f"{nav}@odata.bind"] = f"/{REF[dim][0]}({ids[dim]})"
    if target_drawing_id:
        body["enmax_acdnTargetDrawing@odata.bind"] = (
            f"/enmax_autocaddrawings({target_drawing_id})"
        )

    resp = session.post(
        f"{base}/{API}/enmax_autocadreservations",
        headers={**_headers(token), "Prefer": "return=representation"},
        json=body,
        timeout=120,
    )
    if resp.status_code not in (201, 204):
        raise RuntimeError(f"create reservation failed {resp.status_code}: {resp.text[:500]}")
    if resp.status_code == 201 and resp.content:
        return resp.json().get("enmax_autocadreservationid", rid)
    return rid


def approve_reservation(
    session: requests.Session, base: str, token: str, reservation_id: str
) -> None:
    resp = session.post(
        f"{base}/{API}/enmax_acdnApproveReservation",
        headers=_headers(token),
        json={
            "Target": {
                "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocadreservation",
                "enmax_autocadreservationid": reservation_id,
            }
        },
        timeout=120,
    )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"approve failed {resp.status_code}: {resp.text[:800]}")


def issue_numbers(
    session: requests.Session,
    base: str,
    token: str,
    *,
    reservation_id: str,
    codes: dict[str, str],
    count: int,
) -> dict:
    body = {
        "Business": codes["Business"],
        "Asset": codes["Asset"],
        "Unit": codes["Unit"],
        "Domain": codes["Domain"],
        "System": codes["System"],
        "Kind": codes["Kind"],
        "Count": count,
        "Reservation": {
            "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocadreservation",
            "enmax_autocadreservationid": reservation_id,
        },
    }
    resp = session.post(
        f"{base}/{API}/enmax_acdnIssueNumbers",
        headers=_headers(token),
        json=body,
        timeout=120,
    )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"IssueNumbers failed {resp.status_code}: {resp.text[:800]}")
    try:
        return resp.json() if resp.content else {}
    except Exception:
        return {}


def add_child_items(
    session: requests.Session,
    base: str,
    token: str,
    *,
    drawing_id: str,
    count: int,
) -> dict:
    body = {
        "Drawing": {
            "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocaddrawing",
            "enmax_autocaddrawingid": drawing_id,
        },
        "Count": count,
    }
    resp = session.post(
        f"{base}/{API}/enmax_acdnAddChildItems",
        headers=_headers(token),
        json=body,
        timeout=120,
    )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"AddChildItems failed {resp.status_code}: {resp.text[:800]}")
    try:
        return resp.json() if resp.content else {}
    except Exception:
        return {}


def find_form_base(
    session: requests.Session, base: str, token: str, coding: str
) -> dict | None:
    # Parent number is BB-AA-UU-DDD-SYS-KN-NNNN without -SSS
    resp = session.get(
        f"{base}/{API}/enmax_autocaddrawings",
        headers=_headers(token),
        params={
            "$select": "enmax_autocaddrawingid,enmax_acdnnumber,enmax_acdnsequencenumber,"
            "enmax_acdnreservationtype,enmax_acdndocumentsubtype",
            "$filter": (
                f"startswith(enmax_acdnnumber,'{coding}-') and "
                f"enmax_acdnreservationtype eq {RT_DOCUMENT} and "
                f"enmax_acdndocumentsubtype eq {SUB_FORM}"
            ),
            "$orderby": "enmax_acdnsequencenumber desc",
            "$top": "1",
        },
        timeout=60,
    )
    resp.raise_for_status()
    rows = resp.json().get("value", [])
    return rows[0] if rows else None


def reservation_snapshot(
    session: requests.Session, base: str, token: str, rid: str
) -> dict:
    resp = session.get(
        f"{base}/{API}/enmax_autocadreservations({rid})",
        headers=_headers(token),
        params={
            "$select": "enmax_acdnreservationid,enmax_acdnstatus,enmax_acdnissuednumbers,"
            "enmax_acdnappendfirst,enmax_acdnappendlast"
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def run_new_case(
    session: requests.Session,
    base: str,
    token: str,
    *,
    label: str,
    family: str,
    reservation_type: int,
    document_subtype: int,
    sheets: int,
) -> None:
    seq = pick_top_sequence(session, base, token, family)
    seq_key = seq["enmax_acdnsequencekey"]
    before = int(seq["enmax_acdnlastissued"])
    coding = seq_key.rsplit("|", 1)[0]
    codes = parse_coding(coding)
    ids = resolve_code_ids(session, base, token, codes)

    print(f"\n=== {label} ===")
    print(f"  sequence {seq_key} lastissued={before}")
    rid = create_reservation(
        session,
        base,
        token,
        ids=ids,
        reservation_type=reservation_type,
        document_subtype=document_subtype,
        sequence_type=SEQ_NEW,
        count=1,
        sheets=sheets,
        reason=f"Imported numbering validation: {label}",
    )
    print(f"  created reservation {rid}")
    approve_reservation(session, base, token, rid)
    print("  approved")
    issue = issue_numbers(
        session, base, token, reservation_id=rid, codes=codes, count=1
    )
    print(f"  IssueNumbers → {json.dumps(issue)[:300]}")

    after_row = get_sequence(session, base, token, seq_key)
    after = int(after_row["enmax_acdnlastissued"])
    snap = reservation_snapshot(session, base, token, rid)
    print(f"  lastissued {before} → {after}")
    print(f"  reservation status={snap.get('enmax_acdnstatus')} issued={snap.get('enmax_acdnissuednumbers')}")
    if after != before + 1:
        raise RuntimeError(f"{label}: expected lastissued {before + 1}, got {after}")
    if snap.get("enmax_acdnstatus") != STATUS_APPROVED:
        raise RuntimeError(f"{label}: reservation not approved")
    print(f"  PASS {label}: numbering continued {before} → {after}")


def run_form_append(
    session: requests.Session, base: str, token: str
) -> None:
    seq = pick_top_sequence(session, base, token, "FRM")
    seq_key = seq["enmax_acdnsequencekey"]
    before = int(seq["enmax_acdnlastissued"])
    coding = seq_key.rsplit("|", 1)[0]
    codes = parse_coding(coding)
    ids = resolve_code_ids(session, base, token, codes)
    form_base = find_form_base(session, base, token, coding)
    if not form_base:
        raise RuntimeError(f"no Form base drawing found for coding {coding}")

    print("\n=== Form (Existing append) ===")
    print(f"  sequence {seq_key} lastissued={before} (NNNN unchanged on append)")
    print(f"  target form base {form_base['enmax_acdnnumber']} ({form_base['enmax_autocaddrawingid']})")

    # Highest sheet number before append
    did = form_base["enmax_autocaddrawingid"]
    r = session.get(
        f"{base}/{API}/enmax_autocadsheets",
        headers=_headers(token),
        params={
            "$select": "enmax_acdnsheetnumber",
            "$filter": f"_enmax_acdndrawing_value eq {did}",
            "$orderby": "enmax_acdnsheetnumber desc",
            "$top": "1",
        },
        timeout=60,
    )
    r.raise_for_status()
    sheets = r.json().get("value", [])
    before_sss = int(sheets[0]["enmax_acdnsheetnumber"]) if sheets else 0
    print(f"  highest -SSS before={before_sss:03d}")

    rid = create_reservation(
        session,
        base,
        token,
        ids=ids,
        reservation_type=RT_DOCUMENT,
        document_subtype=SUB_FORM,
        sequence_type=SEQ_EXISTING,
        count=1,
        sheets=1,
        reason="Imported numbering validation: Form append",
        target_drawing_id=did,
    )
    print(f"  created reservation {rid}")
    approve_reservation(session, base, token, rid)
    print("  approved")
    add = add_child_items(session, base, token, drawing_id=did, count=1)
    print(f"  AddChildItems → {json.dumps(add)[:300]}")

    # Stamp reservation append window for UI parity only — children were created by
    # AddChildItems (Rule 14). This PATCH does not issue numbers.
    first = add.get("FirstChildNumber") or add.get("firstChildNumber")
    last = add.get("LastChildNumber") or add.get("lastChildNumber")
    if first is not None and last is not None:
        session.patch(
            f"{base}/{API}/enmax_autocadreservations({rid})",
            headers=_headers(token),
            json={"enmax_acdnappendfirst": first, "enmax_acdnappendlast": last},
            timeout=60,
        )

    time.sleep(2)
    r2 = session.get(
        f"{base}/{API}/enmax_autocadsheets",
        headers=_headers(token),
        params={
            "$select": "enmax_acdnsheetnumber",
            "$filter": f"_enmax_acdndrawing_value eq {did}",
            "$orderby": "enmax_acdnsheetnumber desc",
            "$top": "1",
        },
        timeout=60,
    )
    r2.raise_for_status()
    sheets2 = r2.json().get("value", [])
    after_sss = int(sheets2[0]["enmax_acdnsheetnumber"]) if sheets2 else 0
    after_seq = int(get_sequence(session, base, token, seq_key)["enmax_acdnlastissued"])
    print(f"  highest -SSS after={after_sss:03d}; FRM lastissued still={after_seq}")
    if after_sss != before_sss + 1:
        raise RuntimeError(f"Form: expected SSS {before_sss + 1}, got {after_sss}")
    if after_seq != before:
        raise RuntimeError(f"Form: NNNN lastissued should stay {before}, got {after_seq}")
    print(f"  PASS Form: child SSS continued {before_sss:03d} → {after_sss:03d}")


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser()
    parser.add_argument("--auth", default="azcli")
    parser.add_argument("--confirm-dev", action="store_true")
    parser.add_argument(
        "--confirm-prod",
        action="store_true",
        help="Required when validating against ENMAX Prod.",
    )
    parser.add_argument("--skip-form", action="store_true")
    args = parser.parse_args()

    base = _require_env("DATAVERSE_URL").rstrip("/")
    try:
        require_apply_confirm(
            base,
            confirm_dev=args.confirm_dev,
            confirm_prod=args.confirm_prod,
            action="validate",
        )
    except GateError as exc:
        print(exc.message, file=sys.stderr)
        return 2

    token = acquire_token(base, args.auth)
    session = requests.Session()

    # Drawing Document then Drawing share DRW — second continues after first.
    run_new_case(
        session, base, token,
        label="Drawing Document",
        family="DRW",
        reservation_type=RT_DRAWING,
        document_subtype=SUB_DRAWING_DOCUMENT,
        sheets=0,
    )
    run_new_case(
        session, base, token,
        label="Drawing",
        family="DRW",
        reservation_type=RT_DRAWING,
        document_subtype=SUB_DRAWING,
        sheets=1,
    )
    run_new_case(
        session, base, token,
        label="Standard",
        family="STD",
        reservation_type=RT_DOCUMENT,
        document_subtype=SUB_STANDARD,
        sheets=0,
    )
    run_new_case(
        session, base, token,
        label="Procedure",
        family="PRC",
        reservation_type=RT_DOCUMENT,
        document_subtype=SUB_PROCEDURE,
        sheets=0,
    )
    if not args.skip_form:
        run_form_append(session, base, token)

    print("\nAll numbering continuation checks PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
