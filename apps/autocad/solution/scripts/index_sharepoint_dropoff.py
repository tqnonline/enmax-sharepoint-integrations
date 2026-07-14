#!/usr/bin/env python3
"""
WS5 SharePoint indexer sweep (DEV/UAT helper).

Scans configured drop-off and destination libraries for PDFs, then calls
enmax_acdnUpsertSharePointLinks per drawing/sheet with a FoundFiles payload.
This is what Scheduled_SharePoint_Indexer_Sweep is intended to do; the committed
flow definition still passes FoundFiles=[] and does not list libraries.

Prerequisites:
  DATAVERSE_URL + DATAVERSE_ACCESS_TOKEN
  GRAPH_ACCESS_TOKEN:
    az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv

Usage:
  python solution/scripts/index_sharepoint_dropoff.py --dry-run
  python solution/scripts/index_sharepoint_dropoff.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seed  # noqa: E402
import sharepoint_graph as spg  # noqa: E402
from seed_sharepoint_placeholders_dev import (  # noqa: E402
    _child_number,
    _fetch_app_config,
    _is_base_only_document,
    _list_drawings,
    _list_sheets,
    _normalize_library_url,
    _option_value,
    _require,
)

CONFIG_KEYS = (
    "DrawingsDropOffLibraryUrl",
    "DrawingsDestinationLibraryUrl",
    "DocumentsDropOffLibraryUrl",
    "DocumentsDestinationLibraryUrl",
)


def _fetch_all_app_config(sess: requests.Session, url: str, token: str) -> dict[str, str]:
    flt = " or ".join(f"enmax_acdnkey eq '{k}'" for k in CONFIG_KEYS)
    resp = sess.get(
        f"{url}/api/data/v9.2/enmax_autocadappconfigs",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        params={"$select": "enmax_acdnkey,enmax_acdnvalue", "$filter": flt},
        timeout=60,
    )
    resp.raise_for_status()
    out: dict[str, str] = {}
    for row in resp.json().get("value", []):
        out[row["enmax_acdnkey"]] = _normalize_library_url(row.get("enmax_acdnvalue", ""))
    return out


def _list_pdfs_in_library(library_url: str, graph_token: str) -> list[dict]:
    """Return [{fileName, absoluteUrl, serverRelativeUrl}] for PDFs in a library folder."""
    return spg.list_pdfs(library_url, graph_token)


def _scan_libraries(cfg: dict[str, str], graph_token: str) -> dict[str, list[dict]]:
    """filename (lower) -> list of found file descriptors with libraryKind."""
    index: dict[str, list[dict]] = {}
    scans = [
        ("DrawingsDropOffLibraryUrl", "DropOff"),
        ("DocumentsDropOffLibraryUrl", "DropOff"),
        ("DrawingsDestinationLibraryUrl", "Destination"),
        ("DocumentsDestinationLibraryUrl", "Destination"),
    ]
    for key, kind in scans:
        lib = cfg.get(key, "").strip()
        if not lib:
            continue
        print(f"Scanning {kind}: {lib}")
        for f in _list_pdfs_in_library(lib, graph_token):
            entry = {**f, "libraryKind": kind}
            index.setdefault(f["fileName"].lower(), []).append(entry)
    return index


def _found_files_for(record_number: str, index: dict[str, list[dict]]) -> list[dict]:
    token = f"{record_number}.pdf".lower()
    return index.get(token, [])


def _upsert_found_files(
    sess: requests.Session,
    url: str,
    dv_token: str,
    *,
    entity_set: str,
    entity_id: str,
    record_number: str,
    found_files: list[dict],
    dry_run: bool,
) -> None:
    found_json = json.dumps(found_files)
    odata_type = (
        "Microsoft.Dynamics.CRM.enmax_autocaddrawing"
        if entity_set == "enmax_autocaddrawings"
        else "Microsoft.Dynamics.CRM.enmax_autocadsheet"
    )
    id_field = (
        "enmax_autocaddrawingid" if entity_set == "enmax_autocaddrawings" else "enmax_autocadsheetid"
    )
    payload = {
        "Target": {"@odata.type": odata_type, id_field: entity_id},
        "RecordNumber": record_number,
        "FoundFiles": found_json,
    }
    if dry_run:
        print(f"  [dry-run] {record_number} <- {len(found_files)} file(s)")
        return
    resp = sess.post(
        f"{url}/api/data/v9.2/enmax_acdnUpsertSharePointLinks",
        headers={
            "Authorization": f"Bearer {dv_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
        },
        json=payload,
        timeout=60,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"UpsertSharePointLinks failed ({resp.status_code}): {resp.text[:300]}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Index SharePoint DropOff/Destination PDFs into Dataverse")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=500, help="Max drawings to process")
    args = parser.parse_args()

    dv_url = _require("DATAVERSE_URL").rstrip("/")
    dv_token = seed.acquire_token(dv_url, "spn")
    try:
        graph_token = spg.graph_token()
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    sess = requests.Session()
    cfg = _fetch_all_app_config(sess, dv_url, dv_token)

    if args.dry_run:
        print("Configured libraries:")
        for k in CONFIG_KEYS:
            print(f"  {k}: {cfg.get(k, '(missing)')}")
        print("Dry-run skips SharePoint scan and Dataverse upsert.")
        return 0

    file_index = _scan_libraries(cfg, graph_token)
    print(f"Discovered {sum(len(v) for v in file_index.values())} PDF(s) across libraries.")

    drawings = _list_drawings(sess, dv_url, dv_token, args.limit)
    linked = 0
    cleared = 0
    failed = 0

    for drawing in drawings:
        base = (drawing.get("enmax_acdnnumber") or "").strip()
        if not base:
            continue
        drawing_id = drawing["enmax_autocaddrawingid"]
        rtype = _option_value(drawing, "enmax_acdnreservationtype")
        stype = _option_value(drawing, "enmax_acdndocumentsubtype")

        targets: list[tuple[str, str, str]] = []
        if _is_base_only_document(rtype, stype):
            targets.append(("enmax_autocaddrawings", drawing_id, base))
        else:
            sheets = _list_sheets(sess, dv_url, dv_token, drawing_id)
            if sheets:
                for sheet in sheets:
                    num = _child_number(base, sheet.get("enmax_acdnsheetnumber"), rtype, stype)
                    targets.append(("enmax_autocadsheets", sheet["enmax_autocadsheetid"], num))
            else:
                targets.append(("enmax_autocaddrawings", drawing_id, base))

        for entity_set, entity_id, record_number in targets:
            found = _found_files_for(record_number, file_index)
            try:
                _upsert_found_files(
                    sess, dv_url, dv_token,
                    entity_set=entity_set,
                    entity_id=entity_id,
                    record_number=record_number,
                    found_files=found,
                    dry_run=False,
                )
                if found:
                    linked += 1
                    print(f"OK {record_number} ({len(found)} file(s))")
                else:
                    cleared += 1
                    print(f"MISSING {record_number}")
            except Exception as exc:
                failed += 1
                print(f"FAIL {record_number}: {exc}", file=sys.stderr)

    print(f"Done. Linked {linked}; missing {cleared}; failed {failed}.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
