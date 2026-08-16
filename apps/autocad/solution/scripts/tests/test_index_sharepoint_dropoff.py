"""Tests for index_sharepoint_dropoff.py pure logic: taxonomy resolution,
library-scan dedup, and orphan taxonomy/subtype classification.

These encode the WS5 indexer contract, not just current behavior: legacy
config keys must still work during migration, shared libraries must not be
scanned twice, and an orphan destination file must never be stubbed under a
guessed taxonomy/subtype when the library or Kind is ambiguous
(docs/drawing-document-subtype-CONTRACT.md).
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

import index_sharepoint_dropoff as idx  # noqa: E402


def test_resolve_taxonomy_libraries_prefers_new_keys_over_legacy() -> None:
    cfg = {
        "DrawingDropOffLibraryUrl": "https://tenant/sites/GEN-POC/DropOffLibrary",
        "DrawingDestinationLibraryUrl": "https://tenant/sites/GEN-POC/GF",
        "DrawingsDropOffLibraryUrl": "https://tenant/legacy/dropoff",
    }
    resolved = idx._resolve_taxonomy_libraries(cfg)
    assert resolved["Drawing"] == (
        "https://tenant/sites/GEN-POC/DropOffLibrary",
        "https://tenant/sites/GEN-POC/GF",
    )


def test_resolve_taxonomy_libraries_falls_back_to_legacy_when_new_key_missing() -> None:
    cfg = {
        "DocumentsDropOffLibraryUrl": "https://tenant/legacy/dropoff",
        "DocumentsDestinationLibraryUrl": "https://tenant/legacy/dest",
    }
    resolved = idx._resolve_taxonomy_libraries(cfg)
    assert resolved["Document"] == ("https://tenant/legacy/dropoff", "https://tenant/legacy/dest")


def test_resolve_taxonomy_libraries_falls_back_to_retired_per_taxonomy_keys() -> None:
    # Mid-cutover environments may still only have the old per-taxonomy
    # Standard/Procedure/Form keys configured; the Document fallback chain
    # must reach those too (first non-empty wins).
    cfg = {"StandardDocumentDropOffLibraryUrl": "https://tenant/standard/dropoff"}
    resolved = idx._resolve_taxonomy_libraries(cfg)
    assert resolved["Document"] == ("https://tenant/standard/dropoff", "")


def test_resolve_taxonomy_libraries_missing_key_yields_empty_string() -> None:
    resolved = idx._resolve_taxonomy_libraries({})
    assert resolved["Drawing"] == ("", "")


def test_dedupe_library_scans_collapses_shared_urls_across_taxonomies() -> None:
    taxonomy_libraries = {
        "Drawing": ("https://tenant/drop", "https://tenant/GF"),
        "Document": ("https://tenant/drop", "https://tenant/GF"),
    }
    scans = idx._dedupe_library_scans(taxonomy_libraries)
    # Same physical library shared by both taxonomies -> exactly one DropOff
    # scan and one Destination scan, not four.
    assert len(scans) == 2
    assert scans[("https://tenant/drop", "DropOff")] == {"Drawing", "Document"}
    assert scans[("https://tenant/GF", "Destination")] == {"Drawing", "Document"}


def test_dedupe_library_scans_skips_unconfigured_libraries() -> None:
    taxonomy_libraries = {"Drawing": ("https://tenant/drop", "")}
    scans = idx._dedupe_library_scans(taxonomy_libraries)
    assert scans == {("https://tenant/drop", "DropOff"): {"Drawing"}}


def test_load_record_type_map_parses_configured_json() -> None:
    cfg = {"SharePointRecordTypeMap": '{"Drawing Number":"Drawing","Standard Document":"Standard"}'}
    assert idx._load_record_type_map(cfg) == {"Drawing Number": "Drawing", "Standard Document": "Standard"}


def test_load_record_type_map_returns_empty_on_missing_or_invalid_json() -> None:
    assert idx._load_record_type_map({}) == {}
    assert idx._load_record_type_map({"SharePointRecordTypeMap": "not json"}) == {}


def test_has_child_suffix_matches_three_digit_dash_suffix() -> None:
    assert idx._has_child_suffix("DWG-1234-001.pdf") is True
    assert idx._has_child_suffix("DWG-1234-001") is True  # no .pdf extension


def test_has_child_suffix_rejects_base_only_and_wrong_digit_count() -> None:
    assert idx._has_child_suffix("DWG-1234.pdf") is False
    assert idx._has_child_suffix("DWG-1234-01.pdf") is False
    assert idx._has_child_suffix("DWG-1234-0001.pdf") is False


def test_classify_orphan_taxonomy_subtype_drawing_library_no_suffix_is_drawing_document() -> None:
    entry = {"fileName": "DWG-1234.pdf"}
    classified = idx._classify_orphan_taxonomy_subtype(entry, {"Drawing"}, set(), set())
    assert classified == (idx.RESERVATION_TYPE_DRAWING, idx.DOCUMENT_SUBTYPE_DRAWING_DOCUMENT)


def test_classify_orphan_taxonomy_subtype_drawing_library_with_suffix_is_drawing() -> None:
    entry = {"fileName": "DWG-1234-001.pdf"}
    classified = idx._classify_orphan_taxonomy_subtype(entry, {"Drawing"}, set(), set())
    assert classified == (idx.RESERVATION_TYPE_DRAWING, idx.DOCUMENT_SUBTYPE_DRAWING)


def test_classify_orphan_taxonomy_subtype_drawing_library_ignores_kind() -> None:
    # Kind codes only ever apply to the Document library; a Drawing-library
    # file must classify purely on suffix even if its Kind happens to match
    # a configured Standard/Procedure code.
    entry = {"fileName": "DWG-1234.pdf", "kindSp": "STD"}
    classified = idx._classify_orphan_taxonomy_subtype(entry, {"Drawing"}, {"STD"}, set())
    assert classified == (idx.RESERVATION_TYPE_DRAWING, idx.DOCUMENT_SUBTYPE_DRAWING_DOCUMENT)


def test_classify_orphan_taxonomy_subtype_document_library_standard_kind() -> None:
    entry = {"fileName": "SOP-9.pdf", "kindSp": "STD"}
    classified = idx._classify_orphan_taxonomy_subtype(entry, {"Document"}, {"STD"}, {"PRC"})
    assert classified == (idx.RESERVATION_TYPE_DOCUMENT, idx.DOCUMENT_SUBTYPE_STANDARD)


def test_classify_orphan_taxonomy_subtype_document_library_procedure_kind() -> None:
    entry = {"fileName": "SOP-9.pdf", "kindSp": "PRC"}
    classified = idx._classify_orphan_taxonomy_subtype(entry, {"Document"}, {"STD"}, {"PRC"})
    assert classified == (idx.RESERVATION_TYPE_DOCUMENT, idx.DOCUMENT_SUBTYPE_PROCEDURE)


def test_classify_orphan_taxonomy_subtype_document_library_numbered_child_without_kind_is_form() -> None:
    entry = {"fileName": "FRM-1-001.pdf", "kindSp": ""}
    classified = idx._classify_orphan_taxonomy_subtype(entry, {"Document"}, {"STD"}, {"PRC"})
    assert classified == (idx.RESERVATION_TYPE_DOCUMENT, idx.DOCUMENT_SUBTYPE_FORM)


def test_classify_orphan_taxonomy_subtype_document_library_unmatched_kind_and_no_suffix_is_none() -> None:
    # Base-only file on the Document library with a Kind that matches
    # neither configured list: cannot tell Standard from Procedure. Refuse
    # to guess rather than defaulting to either.
    entry = {"fileName": "SOP-9.pdf", "kindSp": "OTHER"}
    classified = idx._classify_orphan_taxonomy_subtype(entry, {"Document"}, {"STD"}, {"PRC"})
    assert classified is None


def test_classify_orphan_uses_record_type_map_when_kind_missing() -> None:
    entry = {"fileName": "SOP-9.pdf", "kindSp": "", "recordTypeSp": "Standard Document"}
    classified = idx._classify_orphan_taxonomy_subtype(
        entry, {"Document"}, set(), set(), {"Standard Document": "Standard"},
    )
    assert classified == (idx.RESERVATION_TYPE_DOCUMENT, idx.DOCUMENT_SUBTYPE_STANDARD)


def test_classify_orphan_drawing_record_type_drawing_number_without_suffix() -> None:
    entry = {"fileName": "DWG-1234.pdf", "recordTypeSp": "Drawing Number"}
    classified = idx._classify_orphan_taxonomy_subtype(
        entry, {"Drawing"}, set(), set(), {"Drawing Number": "Drawing"},
    )
    assert classified == (idx.RESERVATION_TYPE_DRAWING, idx.DOCUMENT_SUBTYPE_DRAWING)


def test_classify_orphan_taxonomy_subtype_refuses_to_guess_when_library_ambiguous() -> None:
    entry = {"fileName": "DWG-1234.pdf"}
    classified = idx._classify_orphan_taxonomy_subtype(entry, {"Drawing", "Document"}, set(), set())
    assert classified is None


def test_classify_orphan_taxonomy_subtype_refuses_to_guess_when_no_taxonomy_configured() -> None:
    entry = {"fileName": "DWG-1234.pdf"}
    classified = idx._classify_orphan_taxonomy_subtype(entry, set(), set(), set())
    assert classified is None


def test_taxonomy_label_for_subtype_maps_document_subtypes() -> None:
    assert idx._taxonomy_label_for_subtype(idx.RESERVATION_TYPE_DOCUMENT, idx.DOCUMENT_SUBTYPE_STANDARD) == "Standard"
    assert idx._taxonomy_label_for_subtype(idx.RESERVATION_TYPE_DOCUMENT, idx.DOCUMENT_SUBTYPE_PROCEDURE) == "Procedure"
    assert idx._taxonomy_label_for_subtype(idx.RESERVATION_TYPE_DOCUMENT, idx.DOCUMENT_SUBTYPE_FORM) == "Form"


def test_taxonomy_label_for_subtype_maps_drawing_document_and_drawing() -> None:
    assert idx._taxonomy_label_for_subtype(
        idx.RESERVATION_TYPE_DRAWING, idx.DOCUMENT_SUBTYPE_DRAWING_DOCUMENT
    ) == "DrawingDocument"
    assert idx._taxonomy_label_for_subtype(idx.RESERVATION_TYPE_DRAWING, idx.DOCUMENT_SUBTYPE_DRAWING) == "Drawing"


def test_classify_document_library_suffix_beats_kind_match() -> None:
    """Form -SSS must not be swallowed by a Kind CSV hit (Standard/Procedure)."""
    entry = {"fileName": "DOC-0001-001.pdf", "kindSp": "STD"}
    classified = idx._classify_orphan_taxonomy_subtype(
        entry, {"Document"}, {"STD"}, set()
    )
    assert classified == (idx.RESERVATION_TYPE_DOCUMENT, idx.DOCUMENT_SUBTYPE_FORM)


def test_parse_graph_datetime_handles_zulu_suffix() -> None:
    parsed = idx._parse_graph_datetime("2026-07-14T10:00:00Z")
    assert parsed == datetime(2026, 7, 14, 10, 0, 0, tzinfo=timezone.utc)


def test_parse_graph_datetime_handles_missing_or_malformed_value() -> None:
    assert idx._parse_graph_datetime(None) is None
    assert idx._parse_graph_datetime("") is None
    assert idx._parse_graph_datetime("not-a-date") is None
