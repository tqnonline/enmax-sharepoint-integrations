"""Tests for index_sharepoint_dropoff.py pure logic: taxonomy resolution,
library-scan dedup, and orphan taxonomy inference.

These encode the WS5 indexer contract, not just current behavior: legacy
config keys must still work during migration, shared libraries must not be
scanned twice, and an orphan destination file must never be stubbed under a
guessed taxonomy when the library is ambiguous.
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
    # Standard/Procedure/Form all fall back to the same legacy Documents* pair.
    assert resolved["Standard"] == ("https://tenant/legacy/dropoff", "https://tenant/legacy/dest")
    assert resolved["Procedure"] == ("https://tenant/legacy/dropoff", "https://tenant/legacy/dest")
    assert resolved["Form"] == ("https://tenant/legacy/dropoff", "https://tenant/legacy/dest")


def test_resolve_taxonomy_libraries_missing_key_yields_empty_string() -> None:
    resolved = idx._resolve_taxonomy_libraries({})
    assert resolved["Drawing"] == ("", "")


def test_dedupe_library_scans_collapses_shared_urls_across_taxonomies() -> None:
    taxonomy_libraries = {
        "Drawing": ("https://tenant/drop", "https://tenant/GF"),
        "Standard": ("https://tenant/drop", "https://tenant/GF"),
        "Procedure": ("https://tenant/drop", "https://tenant/GF"),
        "Form": ("https://tenant/drop", "https://tenant/GF"),
    }
    scans = idx._dedupe_library_scans(taxonomy_libraries)
    # Same physical library shared by all 4 taxonomies -> exactly one DropOff
    # scan and one Destination scan, not eight.
    assert len(scans) == 2
    assert scans[("https://tenant/drop", "DropOff")] == {"Drawing", "Standard", "Procedure", "Form"}
    assert scans[("https://tenant/GF", "Destination")] == {"Drawing", "Standard", "Procedure", "Form"}


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


def test_resolve_orphan_taxonomy_prefers_record_type_column() -> None:
    entry = {"recordTypeSp": "Standard Document"}
    record_type_map = {"Standard Document": "Standard"}
    # Even though the library serves multiple taxonomies, the SP Record Type
    # column is authoritative when present.
    taxonomy = idx._resolve_orphan_taxonomy(entry, {"Drawing", "Standard", "Form"}, record_type_map)
    assert taxonomy == "Standard"


def test_resolve_orphan_taxonomy_falls_back_to_sole_library_taxonomy() -> None:
    entry = {"recordTypeSp": None}
    taxonomy = idx._resolve_orphan_taxonomy(entry, {"Drawing"}, {})
    assert taxonomy == "Drawing"


def test_resolve_orphan_taxonomy_refuses_to_guess_when_ambiguous() -> None:
    entry = {"recordTypeSp": None}
    taxonomy = idx._resolve_orphan_taxonomy(entry, {"Drawing", "Standard"}, {})
    assert taxonomy is None


def test_resolve_orphan_taxonomy_ignores_unmapped_record_type() -> None:
    entry = {"recordTypeSp": "Unknown Type"}
    taxonomy = idx._resolve_orphan_taxonomy(entry, {"Drawing", "Standard"}, {"Standard Document": "Standard"})
    assert taxonomy is None


def test_parse_graph_datetime_handles_zulu_suffix() -> None:
    parsed = idx._parse_graph_datetime("2026-07-14T10:00:00Z")
    assert parsed == datetime(2026, 7, 14, 10, 0, 0, tzinfo=timezone.utc)


def test_parse_graph_datetime_handles_missing_or_malformed_value() -> None:
    assert idx._parse_graph_datetime(None) is None
    assert idx._parse_graph_datetime("") is None
    assert idx._parse_graph_datetime("not-a-date") is None
