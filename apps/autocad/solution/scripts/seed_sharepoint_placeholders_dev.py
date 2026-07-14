#!/usr/bin/env python3
"""
DEV helper: seed minimal PDF placeholders in SharePoint and link them via
enmax_acdnUpsertSharePointLinks.

Production issuance does NOT create SharePoint files automatically yet — only
the UAT manual flow (UAT_Seed_SharePoint_Test_PDFs) and this script do.

Prerequisites:
  - DATAVERSE_URL + DATAVERSE_ACCESS_TOKEN (e.g. pac auth / az account token for Dataverse)
  - GRAPH_ACCESS_TOKEN for upload mode:
      az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv

Usage:
  python solution/scripts/seed_sharepoint_placeholders_dev.py --dry-run
  python solution/scripts/seed_sharepoint_placeholders_dev.py --link-only --limit 200
  python solution/scripts/seed_sharepoint_placeholders_dev.py --limit 20
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seed  # noqa: E402
import sharepoint_graph as spg  # noqa: E402

MINIMAL_PDF = b"%PDF-1.1\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"

RESERVATION_TYPE_DOCUMENT = 2
DOCUMENT_SUBTYPE_STANDARD = 1
DOCUMENT_SUBTYPE_PROCEDURE = 2
DOCUMENT_SUBTYPE_FORM = 3


def _is_base_only_document(rtype: int | None, stype: int | None) -> bool:
    """Standard and Procedure carry PDFs on the base; Form/Drawing use child sheets."""
    return rtype == RESERVATION_TYPE_DOCUMENT and stype in (
        DOCUMENT_SUBTYPE_STANDARD,
        DOCUMENT_SUBTYPE_PROCEDURE,
    )


def _option_value(row: dict, field: str) -> int | None:
    value = row.get(field)
    if isinstance(value, int):
        return value
    if isinstance(value, dict):
        raw = value.get("value")
        return raw if isinstance(raw, int) else None
    return None


def _require(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        print(f"ERROR: {name} is required", file=sys.stderr)
        sys.exit(1)
    return val


def _normalize_library_url(url: str) -> str:
    """Map legacy enmax.sharepoint.com host to the ENMAX tenant host."""
    return url.replace("https://enmax.sharepoint.com", "https://enmaxcorp.sharepoint.com")


def _fetch_app_config(sess: requests.Session, url: str, token: str) -> dict[str, str]:
    resp = sess.get(
        f"{url}/api/data/v9.2/enmax_autocadappconfigs",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        params={
            "$select": "enmax_acdnkey,enmax_acdnvalue",
            "$filter": (
                "enmax_acdnkey eq 'DrawingsDropOffLibraryUrl' or "
                "enmax_acdnkey eq 'DocumentsDropOffLibraryUrl'"
            ),
        },
        timeout=60,
    )
    resp.raise_for_status()
    out: dict[str, str] = {}
    for row in resp.json().get("value", []):
        out[row["enmax_acdnkey"]] = _normalize_library_url(row.get("enmax_acdnvalue", ""))
    return out


def _dropoff_for_drawing(row: dict, cfg: dict[str, str]) -> str:
    rtype = _option_value(row, "enmax_acdnreservationtype")
    if rtype == RESERVATION_TYPE_DOCUMENT:
        return cfg.get("DocumentsDropOffLibraryUrl", "").rstrip("/")
    return cfg.get("DrawingsDropOffLibraryUrl", "").rstrip("/")


def _list_drawings(sess: requests.Session, url: str, token: str, limit: int) -> list[dict]:
    resp = sess.get(
        f"{url}/api/data/v9.2/enmax_autocaddrawings",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        params={
            "$select": (
                "enmax_autocaddrawingid,enmax_acdnnumber,"
                "enmax_acdnreservationtype,enmax_acdndocumentsubtype"
            ),
            "$filter": "statecode eq 0",
            "$top": str(limit),
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json().get("value", [])


def _list_sheets(sess: requests.Session, url: str, token: str, drawing_id: str) -> list[dict]:
    resp = sess.get(
        f"{url}/api/data/v9.2/enmax_autocadsheets",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        params={
            "$select": "enmax_autocadsheetid,enmax_acdnsheetnumber",
            "$filter": f"_enmax_acdndrawing_value eq {drawing_id}",
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json().get("value", [])


def _child_number(base: str, sheet_number: int | None, rtype: int | None, stype: int | None) -> str:
    if _is_base_only_document(rtype, stype):
        return base
    if sheet_number is None:
        return base
    return f"{base}-{int(sheet_number):03d}"


def _upload_pdf(library_url: str, file_name: str, graph_token: str, dry_run: bool) -> str:
    """Upload minimal PDF via Graph; returns absolute file URL."""
    absolute = f"{library_url}/{file_name}"
    if dry_run:
        return absolute
    return spg.upload_pdf(library_url, file_name, graph_token, MINIMAL_PDF)


def _upsert_links(
    sess: requests.Session,
    url: str,
    dv_token: str,
    *,
    entity_set: str,
    entity_id: str,
    record_number: str,
    file_url: str,
    dry_run: bool,
) -> None:
    found = json.dumps([{
        "serverRelativeUrl": urlparse(file_url).path,
        "absoluteUrl": file_url,
        "libraryKind": "DropOff",
        "fileName": f"{record_number}.pdf",
    }])
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
        "FoundFiles": found,
    }
    if dry_run:
        print(f"  [dry-run] UpsertSharePointLinks {record_number} -> {file_url}")
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
    parser = argparse.ArgumentParser(description="Seed SharePoint placeholder PDFs (DEV)")
    parser.add_argument("--dry-run", action="store_true", help="Print actions only")
    parser.add_argument("--link-only", action="store_true",
                        help="Skip SharePoint upload; link records using configured drop-off URLs")
    parser.add_argument("--limit", type=int, default=50, help="Max drawings to process")
    args = parser.parse_args()

    dv_url = _require("DATAVERSE_URL").rstrip("/")
    dv_token = seed.acquire_token(dv_url, "spn")
    graph_token = ""
    if not args.dry_run and not args.link_only:
        try:
            graph_token = spg.graph_token()
        except RuntimeError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1

    sess = requests.Session()
    cfg = _fetch_app_config(sess, dv_url, dv_token)
    drawings = _list_drawings(sess, dv_url, dv_token, args.limit)

    linked = 0
    failed = 0
    for drawing in drawings:
        base = (drawing.get("enmax_acdnnumber") or "").strip()
        if not base:
            continue
        drawing_id = drawing["enmax_autocaddrawingid"]
        rtype = _option_value(drawing, "enmax_acdnreservationtype")
        stype = _option_value(drawing, "enmax_acdndocumentsubtype")
        library = _dropoff_for_drawing(drawing, cfg)
        if not library:
            print(f"SKIP {base}: no drop-off library configured", file=sys.stderr)
            continue

        sheets = _list_sheets(sess, dv_url, dv_token, drawing_id)
        targets: list[tuple[str, str, str]] = []
        if _is_base_only_document(rtype, stype):
            targets.append(("enmax_autocaddrawings", drawing_id, base))
        elif sheets:
            for sheet in sheets:
                num = _child_number(base, sheet.get("enmax_acdnsheetnumber"), rtype, stype)
                targets.append(("enmax_autocadsheets", sheet["enmax_autocadsheetid"], num))
        else:
            targets.append(("enmax_autocaddrawings", drawing_id, base))

        for entity_set, entity_id, record_number in targets:
            file_name = f"{record_number}.pdf"
            try:
                if args.link_only or args.dry_run:
                    file_url = f"{library}/{file_name}"
                else:
                    file_url = _upload_pdf(library, file_name, graph_token, dry_run=False)
                _upsert_links(
                    sess, dv_url, dv_token,
                    entity_set=entity_set,
                    entity_id=entity_id,
                    record_number=record_number,
                    file_url=file_url,
                    dry_run=args.dry_run,
                )
                linked += 1
                print(f"OK {record_number}")
            except Exception as exc:
                failed += 1
                print(f"FAIL {record_number}: {exc}", file=sys.stderr)

    print(f"Done. Linked {linked} record(s); {failed} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
