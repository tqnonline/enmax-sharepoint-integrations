"""Unit tests for legacy coded PDF parse / Heather classification."""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

import openpyxl  # noqa: E402

from legacy_coded_pdf_parse import (  # noqa: E402
    IMPORT_DRAWING,
    IMPORT_DRAWING_DOCUMENT,
    IMPORT_FORM,
    IMPORT_PROCEDURE,
    IMPORT_STANDARD,
    LEAF_RE,
    STREAM_GF,
    classify_eec,
    classify_gf,
    filename_stem_title,
    parse_excel_stream,
)


def _write_filtered_records(path: Path, rows: list[dict[str, object]]) -> None:
    headers = [
        "TargetFileLeafRef",
        "FullTargetURL",
        "RecordType",
        "LifecycleStatus",
        "TargetTitle",
        "IsRenditionFlag",
        "TargetModified",
        "FullCode",
    ]
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Filtered Records"
    ws.append(headers)
    for row in rows:
        ws.append([row.get(h) for h in headers])
    wb.save(path)
    wb.close()


def test_leaf_exact_and_office():
    assert LEAF_RE.match("GG-SH-01-ECS-HRS-PL-0015-001.pdf")
    assert LEAF_RE.match("DE-9A-00-OPS-BLR-ST-0001.pdf")
    assert LEAF_RE.match("GG-SH-01-EMP-HRG-QC-0002-080.xls.pdf")
    assert not LEAF_RE.match("OBSOLETE GG-CG-00-EIC-AXB-PF-0001-001.pdf")
    assert not LEAF_RE.match("GG-CG-01-EMP-CTG-GA-0104-01.pdf")  # 2-digit sheet
    assert not LEAF_RE.match("GW-GN-00-SAF-WPR-PR-0013-003 CV text.pdf")


def test_classify_gf():
    assert classify_gf(None)[0] == IMPORT_DRAWING_DOCUMENT
    assert classify_gf(1)[0] == IMPORT_DRAWING


def test_classify_eec_heather_rules():
    # SSS wins over dual-ext
    assert classify_eec("PR", 1, "xls")[0] == IMPORT_FORM
    assert classify_eec("ST", 3, "")[0] == IMPORT_FORM
    # ST or dual-ext without SSS → Standard
    assert classify_eec("ST", None, "")[0] == IMPORT_STANDARD
    assert classify_eec("PR", None, "docx")[0] == IMPORT_STANDARD
    # else Procedure
    assert classify_eec("PR", None, "")[0] == IMPORT_PROCEDURE
    assert classify_eec("ON", None, "")[0] == IMPORT_PROCEDURE


def test_filename_stem_title():
    assert filename_stem_title("DE-9A-00-OPS-BLR-ST-0001.pdf") == "DE-9A-00-OPS-BLR-ST-0001"
    assert filename_stem_title("x.xls.pdf") == "x"


def test_rendition_pdf_is_eligible_not_rejected(tmp_path: Path) -> None:
    """Renditions (IsRenditionFlag=Yes) import; they must not hit reject category rendition."""
    leaf = "GG-SH-01-ECS-HRS-PL-0015-001.pdf"
    excel = tmp_path / "gf_rendition.xlsx"
    _write_filtered_records(
        excel,
        [
            {
                "TargetFileLeafRef": leaf,
                "FullTargetURL": "https://example.test/gf/rendition.pdf",
                "RecordType": "Drawing",
                "LifecycleStatus": "Active",
                "TargetTitle": "Rendition drawing",
                "IsRenditionFlag": "Yes",
                "TargetModified": datetime(2024, 6, 1, 12, 0, 0),
                "FullCode": "GG-SH-01-ECS-HRS-PL-0015-001",
            }
        ],
    )

    result = parse_excel_stream(STREAM_GF, excel, ref_codes=None)

    assert len(result.eligible) == 1
    assert len(result.rejected) == 0
    assert result.eligible[0].is_rendition is True
    assert result.eligible[0].reject_category == ""
    assert not any(r.reject_category == "rendition" for r in result.rejected)


def test_same_code_rendition_dedupes_to_latest_modified(tmp_path: Path) -> None:
    """Same parsed code keeps the row with the latest TargetModified (rendition or not)."""
    leaf_rendition = "GG-SH-01-ECS-HRS-PL-0015-001.pdf"
    leaf_primary = "GG-SH-01-ECS-HRS-PL-0015-001.pdf"
    excel = tmp_path / "gf_dedupe.xlsx"
    _write_filtered_records(
        excel,
        [
            {
                "TargetFileLeafRef": leaf_primary,
                "FullTargetURL": "https://example.test/gf/primary.pdf",
                "RecordType": "Drawing",
                "LifecycleStatus": "Active",
                "TargetTitle": "Primary",
                "IsRenditionFlag": "No",
                "TargetModified": datetime(2024, 5, 1, 12, 0, 0),
                "FullCode": "GG-SH-01-ECS-HRS-PL-0015-001",
            },
            {
                "TargetFileLeafRef": leaf_rendition,
                "FullTargetURL": "https://example.test/gf/rendition-newer.pdf",
                "RecordType": "Drawing",
                "LifecycleStatus": "Active",
                "TargetTitle": "Rendition newer",
                "IsRenditionFlag": "Yes",
                "TargetModified": datetime(2024, 6, 1, 12, 0, 0),
                "FullCode": "GG-SH-01-ECS-HRS-PL-0015-001",
            },
        ],
    )

    result = parse_excel_stream(STREAM_GF, excel, ref_codes=None)

    assert len(result.eligible) == 1
    assert result.eligible[0].is_rendition is True
    assert result.eligible[0].url == "https://example.test/gf/rendition-newer.pdf"
    assert len(result.duplicates_dropped) == 1
    assert not any(r.reject_category == "rendition" for r in result.rejected)
