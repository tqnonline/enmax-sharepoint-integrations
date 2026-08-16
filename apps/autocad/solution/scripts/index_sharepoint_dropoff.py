#!/usr/bin/env python3
"""
WS5 SharePoint indexer (DEV/UAT helper).

Scans the two type-level SharePoint library pairs (Drawing* and Document*) for
PDFs, then:
  - upserts FoundFiles metadata via enmax_acdnUpsertSharePointLinks for every
    known drawing/sheet record, and
  - for a destination-library PDF with NO matching Dataverse record, calls
    enmax_acdnCreateSharePointImportStub to create a Pending SharePoint Import
    stub (never done for unmatched drop-off files — drop-off is a working
    area, destination is the authoritative published set).

This is what Scheduled_SharePoint_Indexer_Full/Incremental are intended to do;
the deployed flow definitions upsert with FoundFiles omitted (safe no-op) —
library scanning + orphan stubbing is not yet wired into the low-code flow.

Prerequisites:
  DATAVERSE_URL + DATAVERSE_ACCESS_TOKEN
  GRAPH_ACCESS_TOKEN:
    az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv

Usage:
  python solution/scripts/index_sharepoint_dropoff.py --dry-run
  python solution/scripts/index_sharepoint_dropoff.py --run-type Full
  python solution/scripts/index_sharepoint_dropoff.py --run-type Incremental --modified-hours 2
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seed  # noqa: E402
import sharepoint_graph as spg  # noqa: E402
from seed_sharepoint_placeholders_dev import (  # noqa: E402
    _child_number,
    _normalize_library_url,
    _option_value,
    _require,
)
from taxonomy_predicates import (  # noqa: E402
    is_base_only_document as _is_base_only_document,
    taxonomy_label_from_record_type,
)

# Two library pairs only (docs/drawing-document-subtype-CONTRACT.md): Drawing
# (incl. Drawing Document) and Document (Standard/Procedure/Form — Kind-
# classified, see _classify_orphan_taxonomy_subtype). Legacy per-taxonomy and
# plural keys are read-only fallbacks during cutover.
TAXONOMY_CONFIG_KEYS: dict[str, tuple[str, str]] = {
    "Drawing":  ("DrawingDropOffLibraryUrl", "DrawingDestinationLibraryUrl"),
    "Document": ("DocumentDropOffLibraryUrl", "DocumentDestinationLibraryUrl"),
}

# Fallback chain (in order) for each primary key, tried when the primary key
# is unset. Drawing falls back to the legacy plural Drawings* key; Document
# falls back to the legacy plural Documents* key, then to the (now-retired)
# per-taxonomy Standard/Procedure/Form keys, in case only one of those was
# ever configured for an environment mid-cutover.
FALLBACK_KEY_CHAINS: dict[str, tuple[str, ...]] = {
    "DrawingDropOffLibraryUrl": ("DrawingsDropOffLibraryUrl",),
    "DrawingDestinationLibraryUrl": ("DrawingsDestinationLibraryUrl",),
    "DocumentDropOffLibraryUrl": (
        "DocumentsDropOffLibraryUrl",
        "StandardDocumentDropOffLibraryUrl",
        "ProcedureDocumentDropOffLibraryUrl",
        "FormDocumentDropOffLibraryUrl",
    ),
    "DocumentDestinationLibraryUrl": (
        "DocumentsDestinationLibraryUrl",
        "StandardDocumentDestinationLibraryUrl",
        "ProcedureDocumentDestinationLibraryUrl",
        "FormDocumentDestinationLibraryUrl",
    ),
}

OTHER_CONFIG_KEYS = (
    "DrawingDocumentSPContentTypeId",
    "SharePointIndexerLogFolderPath",
    "SharePointIndexerMaxCsvRows",
    "SharePointIndexerIncrementalHours",
    "SharePointRecordTypeMap",
    "SharePointSiteUrl",
    "StandardDocumentKindCodes",
    "ProcedureDocumentKindCodes",
)

RESERVATION_TYPE_DRAWING = 1
RESERVATION_TYPE_DOCUMENT = 2
DOCUMENT_SUBTYPE_DRAWING_DOCUMENT = 1
DOCUMENT_SUBTYPE_DRAWING = 2
DOCUMENT_SUBTYPE_STANDARD = 3
DOCUMENT_SUBTYPE_PROCEDURE = 4
DOCUMENT_SUBTYPE_FORM = 5

# A child (sheet) filename ends in a literal dash then exactly three digits
# (Rule: -sss ceiling of 999 items). Mirrors CreateSharePointImportStubPlugin's
# ChildSuffixPattern.
_CHILD_SUFFIX_RE = re.compile(r"-\d{3}$")

CSV_COLUMNS = (
    "Timestamp", "RunType", "CorrelationId", "RecordNumber", "EntityType",
    "EntityId", "LibraryKind", "Action", "FileUrl", "Notes",
)


def _library_url_keys() -> set[str]:
    keys: set[str] = set()
    for pair in TAXONOMY_CONFIG_KEYS.values():
        keys.update(pair)
    for chain in FALLBACK_KEY_CHAINS.values():
        keys.update(chain)
    return keys


def _fetch_all_app_config(sess: requests.Session, url: str, token: str) -> dict[str, str]:
    keys = _library_url_keys() | set(OTHER_CONFIG_KEYS)
    flt = " or ".join(f"enmax_acdnkey eq '{k}'" for k in keys)
    resp = sess.get(
        f"{url}/api/data/v9.2/enmax_autocadappconfigs",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        params={"$select": "enmax_acdnkey,enmax_acdnvalue", "$filter": flt},
        timeout=60,
    )
    resp.raise_for_status()
    library_keys = _library_url_keys()
    out: dict[str, str] = {}
    for row in resp.json().get("value", []):
        key = row["enmax_acdnkey"]
        value = row.get("enmax_acdnvalue", "")
        out[key] = _normalize_library_url(value) if key in library_keys else value
    return out


def _resolve_key(cfg: dict[str, str], primary_key: str) -> str:
    """First non-empty value among the primary key and its fallback chain."""
    value = cfg.get(primary_key, "").strip()
    if value:
        return value
    for fallback in FALLBACK_KEY_CHAINS.get(primary_key, ()):
        value = cfg.get(fallback, "").strip()
        if value:
            return value
    return ""


def _resolve_taxonomy_libraries(cfg: dict[str, str]) -> dict[str, tuple[str, str]]:
    """Per-taxonomy (dropOffUrl, destinationUrl): Drawing and Document pairs
    only, each falling back through FALLBACK_KEY_CHAINS during cutover."""
    resolved: dict[str, tuple[str, str]] = {}
    for taxonomy, (drop_key, dest_key) in TAXONOMY_CONFIG_KEYS.items():
        drop_url = _resolve_key(cfg, drop_key)
        dest_url = _resolve_key(cfg, dest_key)
        resolved[taxonomy] = (drop_url.rstrip("/"), dest_url.rstrip("/"))
    return resolved


def _dedupe_library_scans(
    taxonomy_libraries: dict[str, tuple[str, str]],
) -> dict[tuple[str, str], set[str]]:
    """Collapse taxonomy -> (dropOff, destination) into unique (url, kind) -> taxonomies.

    Multiple taxonomies commonly share the same physical library (e.g. DEV points
    every taxonomy's destination library at the same site); scanning each unique
    URL once avoids redundant Graph calls.
    """
    scans: dict[tuple[str, str], set[str]] = {}
    for taxonomy, (drop_url, dest_url) in taxonomy_libraries.items():
        if drop_url:
            scans.setdefault((drop_url, "DropOff"), set()).add(taxonomy)
        if dest_url:
            scans.setdefault((dest_url, "Destination"), set()).add(taxonomy)
    return scans


def _load_record_type_map(cfg: dict[str, str]) -> dict[str, str]:
    raw = cfg.get("SharePointRecordTypeMap", "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return {str(k): str(v) for k, v in parsed.items() if isinstance(v, str)}


def _kind_code_set(cfg: dict[str, str], key: str) -> set[str]:
    raw = cfg.get(key, "")
    return {code.strip() for code in raw.split(",") if code.strip()}


def _has_child_suffix(file_name: str) -> bool:
    stem = file_name[:-4] if file_name.lower().endswith(".pdf") else file_name
    return bool(_CHILD_SUFFIX_RE.search(stem))


def _classify_orphan_taxonomy_subtype(
    entry: dict,
    library_taxonomies: set[str],
    standard_kinds: set[str],
    procedure_kinds: set[str],
    record_type_map: dict[str, str] | None = None,
) -> tuple[int, int] | None:
    """Classify an unmatched destination PDF into (reservationType, documentSubtype).

    Never guesses:
      - Drawing library: no -SSS suffix -> Drawing Document (1); -SSS -> Drawing (2).
        Kind is irrelevant here — StandardDocumentKindCodes/ProcedureDocumentKindCodes
        only ever apply to the Document library.
      - Document library: -SSS -> Form (5); Kind CSV -> Standard/Procedure; else
        SharePointRecordTypeMap / Record Type label fallback; otherwise skip.
      - Any other case (library shared by/ambiguous between taxonomies, or neither
        configured) is skipped — a physical library must map to exactly one taxonomy
        for this to resolve.
    """
    file_name = entry.get("fileName", "")
    record_type_map = record_type_map or {}

    if library_taxonomies == {"Drawing"}:
        if _has_child_suffix(file_name):
            return (RESERVATION_TYPE_DRAWING, DOCUMENT_SUBTYPE_DRAWING)
        # Optional Record Type override (e.g. "Drawing Document" vs "Drawing Number")
        mapped = taxonomy_label_from_record_type(entry.get("recordTypeSp") or "", record_type_map)
        if mapped == "Drawing":
            return (RESERVATION_TYPE_DRAWING, DOCUMENT_SUBTYPE_DRAWING)
        return (RESERVATION_TYPE_DRAWING, DOCUMENT_SUBTYPE_DRAWING_DOCUMENT)

    if library_taxonomies == {"Document"}:
        # Numbered -SSS wins over Kind / Record Type.
        if _has_child_suffix(file_name):
            return (RESERVATION_TYPE_DOCUMENT, DOCUMENT_SUBTYPE_FORM)
        kind = (entry.get("kindSp") or "").strip()
        if kind and kind in standard_kinds:
            return (RESERVATION_TYPE_DOCUMENT, DOCUMENT_SUBTYPE_STANDARD)
        if kind and kind in procedure_kinds:
            return (RESERVATION_TYPE_DOCUMENT, DOCUMENT_SUBTYPE_PROCEDURE)
        mapped = taxonomy_label_from_record_type(entry.get("recordTypeSp") or "", record_type_map)
        if mapped == "Standard":
            return (RESERVATION_TYPE_DOCUMENT, DOCUMENT_SUBTYPE_STANDARD)
        if mapped == "Procedure":
            return (RESERVATION_TYPE_DOCUMENT, DOCUMENT_SUBTYPE_PROCEDURE)
        if mapped == "Form":
            return (RESERVATION_TYPE_DOCUMENT, DOCUMENT_SUBTYPE_FORM)
        return None

    return None


_TAXONOMY_LABEL_BY_DOCUMENT_SUBTYPE: dict[int, str] = {
    DOCUMENT_SUBTYPE_DRAWING_DOCUMENT: "DrawingDocument",
    DOCUMENT_SUBTYPE_DRAWING: "Drawing",
    DOCUMENT_SUBTYPE_STANDARD: "Standard",
    DOCUMENT_SUBTYPE_PROCEDURE: "Procedure",
    DOCUMENT_SUBTYPE_FORM: "Form",
}


def _taxonomy_label_for_subtype(reservation_type: int, document_subtype: int) -> str:
    """Map a classified (reservationType, documentSubtype) pair to the Taxonomy
    string accepted by enmax_acdnCreateSharePointImportStub
    (CreateSharePointImportStubPlugin.ParseTaxonomy).
    """
    label = _TAXONOMY_LABEL_BY_DOCUMENT_SUBTYPE.get(document_subtype)
    if label is None:
        raise ValueError(
            f"No stub Taxonomy label for reservationType={reservation_type} "
            f"documentSubtype={document_subtype}"
        )
    return label


def _parse_graph_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _scan_libraries(
    scans: dict[tuple[str, str], set[str]],
    graph_token: str,
    *,
    content_type_id: str | None,
    modified_since: datetime | None,
) -> dict[str, list[dict]]:
    """filename (lower) -> found file descriptors, each tagged with libraryKind + taxonomies."""
    index: dict[str, list[dict]] = {}
    for (library_url, kind), taxonomies in scans.items():
        print(f"Scanning {kind}: {library_url} (taxonomies: {', '.join(sorted(taxonomies))})")
        for f in spg.list_pdfs(library_url, graph_token, content_type_id=content_type_id):
            if modified_since is not None:
                modified = _parse_graph_datetime(f.get("lastModifiedDateTime"))
                if modified is not None and modified < modified_since:
                    continue
            entry = {**f, "libraryKind": kind, "taxonomies": taxonomies}
            index.setdefault(f["fileName"].lower(), []).append(entry)
    return index


def _found_files_for(record_number: str, index: dict[str, list[dict]]) -> list[dict]:
    token = f"{record_number}.pdf".lower()
    return index.get(token, [])


def _log_row(
    *, record_number: str, entity_type: str, entity_id: str, library_kind: str,
    action: str, file_url: str = "", notes: str = "",
) -> dict:
    return {
        "Timestamp": datetime.now(timezone.utc).isoformat(),
        "RecordNumber": record_number,
        "EntityType": entity_type,
        "EntityId": entity_id,
        "LibraryKind": library_kind,
        "Action": action,
        "FileUrl": file_url,
        "Notes": notes,
    }


def _write_csv_log(rows: list[dict], run_type: str, correlation_id: str, max_rows: int) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log_dir = Path(__file__).resolve().parent / ".indexer_logs"
    log_dir.mkdir(exist_ok=True)
    path = log_dir / f"IndexRun_{run_type}_{timestamp}_{correlation_id}.csv"

    truncated = len(rows) > max_rows
    detail_rows = rows[:max_rows]

    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for row in detail_rows:
            merged = {**row, "RunType": run_type, "CorrelationId": correlation_id}
            writer.writerow({c: merged.get(c, "") for c in CSV_COLUMNS})
        if truncated:
            writer.writerow({
                "Timestamp": datetime.now(timezone.utc).isoformat(),
                "RunType": run_type,
                "CorrelationId": correlation_id,
                "Action": "SummaryTruncated",
                "Notes": f"{len(rows) - max_rows} additional row(s) omitted "
                         f"(SharePointIndexerMaxCsvRows={max_rows}).",
            })
    return path


def _upload_log(path: Path, cfg: dict[str, str], graph_token: str) -> None:
    """Best-effort upload of the CSV run log; never fails the indexer run."""
    folder_path = cfg.get("SharePointIndexerLogFolderPath", "").strip()
    site_url = cfg.get("SharePointSiteUrl", "").strip()
    if not folder_path or not site_url:
        print("SKIP log upload: SharePointIndexerLogFolderPath/SharePointSiteUrl not configured",
              file=sys.stderr)
        return

    parts = folder_path.split("/", 1)
    configured_drive, sub_folder = parts[0], (parts[1] if len(parts) > 1 else "")
    site_base = site_url.rstrip("/")
    # The default document library's server-relative name is usually "Shared
    # Documents" but the Graph drive `name` is often just "Documents" — try
    # both rather than hard-coding one, since this varies by tenant/template.
    candidates = ["Shared Documents", "Documents"] if configured_drive == "Shared Documents" else [configured_drive]

    last_error: Exception | None = None
    for drive_name in candidates:
        try:
            web_url = spg.upload_file(
                f"{site_base}/{drive_name}", sub_folder, path.name, graph_token,
                path.read_bytes(), content_type="text/csv",
            )
            print(f"Uploaded run log: {web_url}")
            return
        except Exception as exc:  # best-effort — never fail the indexer run over log upload
            last_error = exc
    print(f"WARN: log upload failed for all drive-name candidates: {last_error}", file=sys.stderr)


def _upsert_found_files(
    sess: requests.Session,
    url: str,
    dv_token: str,
    *,
    entity_set: str,
    entity_id: str,
    record_number: str,
    found_files: list[dict],
) -> None:
    found_json = json.dumps([
        {k: v for k, v in f.items() if k in ("fileName", "absoluteUrl", "serverRelativeUrl", "libraryKind")}
        for f in found_files
    ])
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


def _create_import_stub(
    sess: requests.Session,
    url: str,
    dv_token: str,
    entry: dict,
    taxonomy: str,
) -> dict:
    payload: dict[str, str] = {
        "FileName": entry["fileName"],
        "FileUrl": entry["absoluteUrl"],
        "Taxonomy": taxonomy,
    }
    if entry.get("recordTypeSp"):
        payload["RecordTypeSp"] = entry["recordTypeSp"]
    metadata = {
        k: v for k, v in entry.items()
        if k in ("contentTypeId", "lastModifiedDateTime", "serverRelativeUrl") and v
    }
    if metadata:
        payload["MetadataJson"] = json.dumps(metadata)

    resp = sess.post(
        f"{url}/api/data/v9.2/enmax_acdnCreateSharePointImportStub",
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
        raise RuntimeError(f"CreateSharePointImportStub failed ({resp.status_code}): {resp.text[:300]}")
    return resp.json()


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Index SharePoint drop-off/destination PDFs into Dataverse")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=500, help="Max drawings to process")
    parser.add_argument("--run-type", choices=("Full", "Incremental"), default="Full")
    parser.add_argument(
        "--modified-hours", type=int, default=None,
        help="Incremental lookback window in hours; defaults to SharePointIndexerIncrementalHours",
    )
    parser.add_argument(
        "--upload-log", action="store_true",
        help="Best-effort upload of the CSV run log to SharePointIndexerLogFolderPath via Graph",
    )
    args = parser.parse_args()

    dv_url = _require("DATAVERSE_URL").rstrip("/")
    dv_token = seed.acquire_token(dv_url, "spn")
    sess = requests.Session()
    cfg = _fetch_all_app_config(sess, dv_url, dv_token)
    taxonomy_libraries = _resolve_taxonomy_libraries(cfg)

    if args.dry_run:
        print(f"Run type: {args.run_type}")
        print("Resolved taxonomy libraries:")
        for taxonomy, (drop_url, dest_url) in taxonomy_libraries.items():
            print(f"  {taxonomy}: dropOff={drop_url or '(missing)'} destination={dest_url or '(missing)'}")
        print("Other config:")
        for k in OTHER_CONFIG_KEYS:
            print(f"  {k}: {cfg.get(k, '(missing)')}")
        print("Dry-run skips SharePoint scan and Dataverse upsert.")
        return 0

    try:
        graph_token = spg.graph_token()
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    correlation_id = str(uuid.uuid4())
    max_csv_rows = int(cfg.get("SharePointIndexerMaxCsvRows", "5000") or "5000")
    content_type_id = cfg.get("DrawingDocumentSPContentTypeId", "").strip() or None

    modified_since = None
    if args.run_type == "Incremental":
        hours = args.modified_hours or int(cfg.get("SharePointIndexerIncrementalHours", "1") or "1")
        modified_since = datetime.now(timezone.utc) - timedelta(hours=hours)
        print(f"Incremental run: only files modified since {modified_since.isoformat()}")

    scans = _dedupe_library_scans(taxonomy_libraries)
    file_index = _scan_libraries(scans, graph_token, content_type_id=content_type_id, modified_since=modified_since)
    print(f"Discovered {sum(len(v) for v in file_index.values())} PDF(s) across {len(scans)} library scan(s).")

    drawings = _list_drawings(sess, dv_url, dv_token, args.limit)
    linked = 0
    cleared = 0
    failed = 0
    matched_tokens: set[str] = set()
    log_rows: list[dict] = []

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
            token = f"{record_number}.pdf".lower()
            found = _found_files_for(record_number, file_index)
            if found:
                matched_tokens.add(token)
            entity_type = "Drawing" if entity_set == "enmax_autocaddrawings" else "Sheet"
            try:
                _upsert_found_files(
                    sess, dv_url, dv_token,
                    entity_set=entity_set,
                    entity_id=entity_id,
                    record_number=record_number,
                    found_files=found,
                )
                if found:
                    linked += 1
                    print(f"OK {record_number} ({len(found)} file(s))")
                    log_rows.append(_log_row(
                        record_number=record_number, entity_type=entity_type, entity_id=entity_id,
                        library_kind="/".join(sorted({f["libraryKind"] for f in found})),
                        action="Linked", file_url=found[0].get("absoluteUrl", ""),
                    ))
                else:
                    cleared += 1
                    print(f"MISSING {record_number}")
                    log_rows.append(_log_row(
                        record_number=record_number, entity_type=entity_type, entity_id=entity_id,
                        library_kind="", action="Missing",
                    ))
            except Exception as exc:
                failed += 1
                print(f"FAIL {record_number}: {exc}", file=sys.stderr)
                log_rows.append(_log_row(
                    record_number=record_number, entity_type=entity_type, entity_id=entity_id,
                    library_kind="", action="Failed", notes=str(exc),
                ))

    # Orphan sweep: destination-library PDFs never referenced by a known
    # drawing/sheet. Never done for drop-off — that library is a working area.
    orphan_created = 0
    orphan_skipped = 0
    standard_kinds = _kind_code_set(cfg, "StandardDocumentKindCodes")
    procedure_kinds = _kind_code_set(cfg, "ProcedureDocumentKindCodes")
    record_type_map = _load_record_type_map(cfg)
    for token, entries in file_index.items():
        if token in matched_tokens:
            continue
        for entry in entries:
            if entry["libraryKind"] != "Destination":
                continue
            classified = _classify_orphan_taxonomy_subtype(
                entry, entry["taxonomies"], standard_kinds, procedure_kinds, record_type_map,
            )
            if classified is None:
                orphan_skipped += 1
                print(f"ORPHAN SKIP {entry['fileName']}: cannot classify taxonomy/subtype", file=sys.stderr)
                log_rows.append(_log_row(
                    record_number="", entity_type="", entity_id="", library_kind="Destination",
                    action="OrphanSkipped", file_url=entry.get("absoluteUrl", ""),
                    notes="Cannot classify taxonomy/subtype (ambiguous library, Kind, or Record Type)",
                ))
                continue
            reservation_type, document_subtype = classified
            taxonomy = _taxonomy_label_for_subtype(reservation_type, document_subtype)
            try:
                result = _create_import_stub(sess, dv_url, dv_token, entry, taxonomy)
                orphan_created += 1
                print(f"ORPHAN STUB {entry['fileName']} -> {taxonomy} (subtype={document_subtype}) "
                      f"(drawing {result.get('DrawingId')}, created={result.get('Created')})")
                log_rows.append(_log_row(
                    record_number=result.get("RecordNumber", ""), entity_type=taxonomy,
                    entity_id=result.get("DrawingId", ""), library_kind="Destination",
                    action="OrphanStubCreated", file_url=entry.get("absoluteUrl", ""),
                ))
            except Exception as exc:
                orphan_skipped += 1
                print(f"ORPHAN FAIL {entry['fileName']}: {exc}", file=sys.stderr)
                log_rows.append(_log_row(
                    record_number="", entity_type=taxonomy, entity_id="", library_kind="Destination",
                    action="OrphanStubFailed", file_url=entry.get("absoluteUrl", ""), notes=str(exc),
                ))

    log_path = _write_csv_log(log_rows, args.run_type, correlation_id, max_csv_rows)
    print(f"Run log written: {log_path}")
    if args.upload_log:
        _upload_log(log_path, cfg, graph_token)

    print(
        f"Done. Linked {linked}; missing {cleared}; failed {failed}; "
        f"orphan stubs created {orphan_created}; orphan skipped {orphan_skipped}."
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
