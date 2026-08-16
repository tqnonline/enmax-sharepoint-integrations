#!/usr/bin/env python3
"""Assign fresh component GUIDs to enmax_autocadflowexception (copied from broadcast dismissal)."""

from __future__ import annotations

import re
import uuid
from pathlib import Path

ENTITY_DIR = Path(__file__).resolve().parent.parent / "src/Entities/enmax_autocadflowexception"

GUID_RE = re.compile(
    r"\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}"
)


def _new_guid() -> str:
    return str(uuid.uuid4())


def main() -> int:
    # Map old -> new for every GUID found under entity dir (except entity type code refs if any).
    mapping: dict[str, str] = {}

    for path in sorted(ENTITY_DIR.rglob("*")):
        if path.is_dir():
            continue
        text = path.read_text(encoding="utf-8")
        for match in GUID_RE.findall(text):
            if match not in mapping:
                mapping[match] = "{" + _new_guid() + "}"

    # Rewrite file contents and rename braced filenames.
    for path in sorted(ENTITY_DIR.rglob("*"), reverse=True):
        if path.is_dir():
            continue
        text = path.read_text(encoding="utf-8")
        for old, new in mapping.items():
            text = text.replace(old, new)
        path.write_text(text, encoding="utf-8")

        if path.stem.startswith("{") and path.stem.endswith("}"):
            old_name = path.stem
            new_name = mapping.get(old_name, old_name)
            if new_name != old_name:
                path.rename(path.with_name(f"{new_name}{path.suffix}"))

    print(f"Regenerated {len(mapping)} GUID(s) under {ENTITY_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
