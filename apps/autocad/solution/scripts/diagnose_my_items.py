#!/usr/bin/env python3
"""Diagnose My Items Available tab: trace Dataverse data vs app filter logic."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

BASE = os.environ.get("DATAVERSE_URL", "https://nrg-enmax-dev.crm3.dynamics.com").rstrip("/")
API = f"{BASE}/api/data/v9.2"


def token() -> str:
    t = os.environ.get("DATAVERSE_ACCESS_TOKEN", "").strip()
    if t:
        return t
    return subprocess.check_output(
        ["az", "account", "get-access-token", "--resource", BASE, "--query", "accessToken", "-o", "tsv"],
        text=True,
    ).strip()


def get(path: str, params: dict | None = None) -> dict:
    qs = urllib.parse.urlencode(params or {}, safe="(),'")
    url = f"{API}/{path}" + (f"?{qs}" if qs else "")
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token()}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def in_iso_range(iso: str | None, from_d: str, to_d: str) -> bool:
    if not iso:
        return not (from_d or to_d)
    def parse_local(s: str) -> float:
        y, m, d = map(int, s.split("-"))
        return datetime(y, m, d).timestamp()
    from_ms = parse_local(from_d) if from_d else float("-inf")
    to_ms = parse_local(to_d) + 86400 - 1 if to_d else float("inf")
    ms = datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
    return from_ms <= ms <= to_ms


def row_date_available(created: str, modified: str, checked_in: str) -> str:
    return max((value for value in (checked_in, modified, created) if value), default="")


def main() -> int:
    user_id = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DATAVERSE_USER_ID", "")).strip()
    if not user_id:
        print(
            "Usage: diagnose_my_items.py <system-user-guid> "
            "(or set DATAVERSE_USER_ID)",
            file=sys.stderr,
        )
        return 2
    print(f"UserId: {user_id}")

    res = get("enmax_autocadreservations", {
        "$filter": f"_createdby_value eq {user_id}",
        "$select": "enmax_autocadreservationid,createdon,enmax_acdnreservationtype",
        "$orderby": "createdon desc",
        "$top": "5000",
    })
    reservation_ids = [r["enmax_autocadreservationid"] for r in res.get("value", [])]
    print(f"Reservations (createdby=user): {len(reservation_ids)}")

    drawing_ids: list[str] = []
    chunk = 40
    for i in range(0, len(reservation_ids), chunk):
        part = reservation_ids[i : i + chunk]
        clause = " or ".join(f"_enmax_acdnreservation_value eq '{rid}'" for rid in part)
        dr = get("enmax_autocaddrawings", {
            "$filter": f"({clause})",
            "$select": "enmax_autocaddrawingid",
            "$top": "5000",
        })
        drawing_ids.extend(r["enmax_autocaddrawingid"] for r in dr.get("value", []) if r.get("enmax_autocaddrawingid"))
    drawing_ids = list(dict.fromkeys(drawing_ids))
    print(f"Drawings under those reservations: {len(drawing_ids)}")

    sheets: list[dict] = []
    for i in range(0, len(drawing_ids), chunk):
        part = drawing_ids[i : i + chunk]
        clause = " or ".join(f"_enmax_acdndrawing_value eq '{did}'" for did in part)
        sr = get("enmax_autocadsheets", {
            "$filter": f"({clause}) and enmax_acdnstate eq 2",
            "$select": "enmax_autocadsheetid,createdon,modifiedon,enmax_acdnfilename,_enmax_acdndrawing_value",
            "$top": "5000",
        })
        sheets.extend(sr.get("value", []))
    print(f"Available sheets (state=2) under user drawings: {len(sheets)}")

    today = datetime.now().date()
    from_d = (today - timedelta(days=30)).isoformat()
    to_d = today.isoformat()
    print(f"30-day filter window: {from_d} .. {to_d}")

    in_window = []
    for s in sheets:
        date_iso = row_date_available(s.get("createdon", ""), s.get("modifiedon", ""), "")
        if in_iso_range(date_iso, from_d, to_d):
            in_window.append(s)
    print(f"Sheets passing 30-day client filter: {len(in_window)}")

    if sheets[:3]:
        print("\nSample sheets (all):")
        for s in sheets[:3]:
            print(" ", s.get("enmax_autocadsheetid"), "created", s.get("createdon"), "modified", s.get("modifiedon"))

    # Inverted range from screenshot
    bad_from, bad_to = "2026-08-10", "2026-07-10"
    bad_count = sum(
        1 for s in sheets
        if in_iso_range(row_date_available(s.get("createdon", ""), s.get("modifiedon", ""), ""), bad_from, bad_to)
    )
    print(f"\nSheets passing INVERTED range {bad_from}..{bad_to}: {bad_count}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
