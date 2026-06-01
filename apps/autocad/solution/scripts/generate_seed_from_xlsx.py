"""Generate reference + combination seed YAML from the Generation Drawing
Information Category workbook (LITERAL labels; intentionally overrides PRD §22 —
see docs/superpowers/specs/2026-06-01-master-reference-data-load-design.md).

Usage:
  uv run --with openpyxl --with pyyaml python solution/scripts/generate_seed_from_xlsx.py [--workbook PATH] [--dry-run]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SEED_REF_DIR = REPO_ROOT / "solution" / "seed" / "reference"
DEFAULT_WORKBOOK = Path(r"D:\Developer\Github\specs\Generation Drawing Information Category.xlsx")

# Excel header (row 3, 1-indexed) -> logical seed key
COL_MAP: dict[str, str] = {
    "Business": "business",
    "Asset (Facility)": "asset",
    "Unit": "unit",
    "Domain (Group)": "domain",
    "System": "system",
    "Kind": "kind",
    "Vendor Name": "vendor",
    "Record Type": "record_type",
    "Record Phase": "record_phase",
}
TABLE: dict[str, str] = {
    "business": "enmax_autocadbusiness", "asset": "enmax_autocadasset", "unit": "enmax_autocadunit",
    "domain": "enmax_autocaddomain", "system": "enmax_autocadsystem", "kind": "enmax_autocadkind",
    "vendor": "enmax_autocadvendor", "record_type": "enmax_autocadrecordtype",
    "record_phase": "enmax_autocadrecordphase",
}
# Columns whose whole cell is the value (never split on a separator)
NO_SPLIT = {"vendor"}
_SKIP = {"", "text field", "date field"}
# A separator = a space, then a single dash-like (or U+FFFD mojibake) char, then a space.
# Explicit code points so "&" / other punctuation in labels is never treated as a separator.
_SEP_RE = re.compile("\\s[-‒–—―−�]\\s")
_SINGLE_DIGIT_RE = re.compile(r"\d")


def split_code_label(cell: str) -> tuple[str, str]:
    """Literal split on the FIRST ' - '-style separator. No PRD §22 cleaning."""
    text = cell.strip()
    m = _SEP_RE.search(text)
    if m:
        return text[: m.start()].strip(), text[m.end():].strip()
    return text, text


def unit_code(cell: str) -> str:
    """Pad a single-digit numeric unit code to 2 chars (Excel strips leading zeros)."""
    c = cell.strip()
    return f"0{c}" if _SINGLE_DIGIT_RE.fullmatch(c) else c


def parse_cell(raw: Any, key: str) -> tuple[str, str] | None:
    """Return (code, display_name) for a cell, or None to skip it."""
    if raw is None:
        return None
    text = str(raw).strip()
    if text.lower() in _SKIP:
        return None
    if key == "unit":
        code = unit_code(text)
        return code, code
    if key in NO_SPLIT:
        return text, text
    return split_code_label(text)


def _yaml_dump(data: dict, path: Path, dry_run: bool) -> None:
    import yaml
    text = yaml.dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False)
    if dry_run:
        print(f"  [DRY] {path.name}: {len(data.get('rows', []))} rows")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    print(f"  {path.name}: {len(data.get('rows', []))} rows")


def _reference_rows(values: list[tuple[str, str]]) -> list[dict]:
    """De-dup (code, display) pairs by code (first wins); add status + sort_order."""
    seen: set[str] = set()
    rows: list[dict] = []
    order = 10
    for code, display in values:
        if code in seen:
            continue
        seen.add(code)
        rows.append({"code": code, "display_name": display, "status": 1, "sort_order": order})
        order += 10
    return rows


def build(workbook: Path) -> dict[str, dict]:
    """Read the workbook; return {filename: yaml-doc-dict} for all 11 files."""
    import openpyxl
    wb = openpyxl.load_workbook(workbook, read_only=True, data_only=True)
    ws = wb.active  # the workbook has a single sheet
    grid = list(ws.iter_rows(values_only=True))
    wb.close()

    # Layout: row0 title, row1 blank, row2 header, row3+ data (0-indexed).
    header = [str(c).strip() if c is not None else "" for c in grid[2]]
    col_idx = {h: i for i, h in enumerate(header) if h in COL_MAP}

    collected: dict[str, list[tuple[str, str]]] = {k: [] for k in COL_MAP.values()}
    for row in grid[3:]:
        for hdr, idx in col_idx.items():
            key = COL_MAP[hdr]
            parsed = parse_cell(row[idx] if idx < len(row) else None, key)
            if parsed:
                collected[key].append(parsed)

    docs: dict[str, dict] = {}
    for key, table in TABLE.items():
        docs[f"{key}.yaml"] = {
            "table": table, "natural_key_columns": ["code"], "rows": _reference_rows(collected[key])
        }

    asset_codes = [r["code"] for r in docs["asset.yaml"]["rows"]]
    unit_codes = [r["code"] for r in docs["unit.yaml"]["rows"]]
    business_codes = [r["code"] for r in docs["business.yaml"]["rows"]]

    docs["approved_bb_aa.yaml"] = {
        "table": "enmax_autocadbusinessasset",
        "natural_key_columns": ["business_code", "asset_code"],
        "lookups": {
            "business": {"table": "enmax_autocadbusiness", "key": "code", "source_column": "business_code"},
            "asset": {"table": "enmax_autocadasset", "key": "code", "source_column": "asset_code"},
        },
        "rows": [{"business_code": b, "asset_code": a, "name": f"{b}-{a}"}
                 for b in business_codes for a in asset_codes],
    }
    docs["asset_unit.yaml"] = {
        "table": "enmax_autocadassetunit",
        "natural_key_columns": ["asset_code", "unit_code"],
        "lookups": {
            "asset": {"table": "enmax_autocadasset", "key": "code", "source_column": "asset_code"},
            "unit": {"table": "enmax_autocadunit", "key": "code", "source_column": "unit_code"},
        },
        "rows": [{"asset_code": a, "unit_code": u, "name": f"{a}-{u}"}
                 for a in asset_codes for u in unit_codes],
    }
    docs["system_scope.yaml"] = {
        "table": "enmax_autocadsystemscope",
        "natural_key_columns": ["system_code", "scope_type", "scope_value"],
        "rows": [],
    }
    return docs


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate seed YAML from the Generation xlsx")
    ap.add_argument("--workbook", default=str(DEFAULT_WORKBOOK))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    wb_path = Path(args.workbook)
    if not wb_path.exists():
        print(f"ERROR: workbook not found: {wb_path}", file=sys.stderr)
        return 1

    print(f"Reading {wb_path.name}")
    docs = build(wb_path)
    print(f"Writing to {SEED_REF_DIR}")
    for filename, doc in docs.items():
        _yaml_dump(doc, SEED_REF_DIR / filename, args.dry_run)
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
