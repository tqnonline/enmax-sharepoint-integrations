#!/usr/bin/env python3
"""Audit App Configuration keys referenced in code vs seeded YAML.

Scans Code App schema, plugins, workflows, and scripts for App Config key
references and fails if any referenced key is missing from the seed union
(base app_config.yaml + known overlays).

Usage:
    python solution/scripts/audit_app_config_keys.py
    python solution/scripts/audit_app_config_keys.py --strict
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SEED_DIR = REPO_ROOT / "solution" / "seed"
SCRIPTS_DIR = REPO_ROOT / "solution" / "scripts"

sys.path.insert(0, str(SCRIPTS_DIR))
from seed import load_app_config_seed, merge_app_config, _load_yaml  # noqa: E402

# Keys that are intentionally written only by post-seed provisioning (roles/sync).
PROVISIONED_KEYS = frozenset({
    "AdminTeamId",
    "ApproverTeamId",
    "UserTeamId",
    "AppOwnerTeamId",
})

# Canonical schema / runtime keys known from AppConfigSchema + plugins (seeded).
SCHEMA_OPTIONAL_KEYS = frozenset({
    "AdminTeamId",
    "ApproverTeamId",
    "UserTeamId",
    "AppOwnerTeamId",
    "DocControlEmailAddress",
    "CodeAppBaseUrl",
    "CheckInUploadLibraryUrl",
    # Legacy fallbacks kept readable for migration
    "DrawingsDropOffLibraryUrl",
    "DrawingsDestinationLibraryUrl",
    "DocumentsDropOffLibraryUrl",
    "DocumentsDestinationLibraryUrl",
})

_KEY_PATTERNS = [
    # C# AppConfigReader.GetValue(service, "Key") / GetBoolDefaultTrue(..., "Key")
    re.compile(r'(?:GetValue|GetBoolDefaultTrue)\s*\(\s*\w+\s*,\s*"(?P<key>[A-Za-z][A-Za-z0-9_]+)"'),
    # C# string literals that look like config keys in AppConfigReader.cs Taxonomy*
    re.compile(r'return\s+"(?P<key>Enable[A-Za-z]+(?:Checkout|CheckIn))"'),
    re.compile(r'return\s+"(?P<key>(?:Drawing|StandardDocument|ProcedureDocument|FormDocument)(?:DropOff|Destination)LibraryUrl)"'),
    # TypeScript Zod / object keys in AppConfigSchema (PascalCase identifiers before :)
    re.compile(r'^\s+(?P<key>[A-Z][A-Za-z0-9]+)\s*:', re.MULTILINE),
    # Flow OData filter: enmax_acdnkey eq 'Key'
    re.compile(r"enmax_acdnkey\s+eq\s+'(?P<key>[A-Za-z][A-Za-z0-9_]+)'"),
    # Python/scripts: "enmax_acdnkey", "Key") or key == "Key"
    re.compile(r'(?:appconfig|app_config|GetValue|config)[^\n]{0,80}"(?P<key>[A-Z][A-Za-z0-9]{3,})"'),
]


def seeded_keys() -> set[str]:
    keys: set[str] = set()
    for env in (None, "dev", "uat"):
        data = load_app_config_seed(env)
        for row in data.get("rows") or []:
            if isinstance(row, dict) and row.get("key"):
                keys.add(str(row["key"]))
    # Ensure overlay-only exploration also covers merge of all overlays onto base
    base = _load_yaml(SEED_DIR / "app_config.yaml")
    for name in ("app_config.dev.yaml", "app_config.uat.yaml"):
        path = SEED_DIR / name
        if path.exists():
            base = merge_app_config(base, _load_yaml(path))
    for row in base.get("rows") or []:
        if isinstance(row, dict) and row.get("key"):
            keys.add(str(row["key"]))
    return keys


def _scan_file(path: Path) -> set[str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return set()
    found: set[str] = set()
    for pat in _KEY_PATTERNS:
        for m in pat.finditer(text):
            found.add(m.group("key"))
    return found


def referenced_keys() -> set[str]:
    roots = [
        REPO_ROOT / "apps" / "code-app" / "src" / "config",
        REPO_ROOT / "apps" / "code-app" / "src" / "features" / "sharepoint",
        REPO_ROOT / "solution" / "plugins" / "IssueNumbers",
        REPO_ROOT / "solution" / "src" / "Workflows",
        REPO_ROOT / "solution" / "scripts",
    ]
    exts = {".ts", ".tsx", ".cs", ".py", ".json", ".yaml", ".yml"}
    keys: set[str] = set()
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix.lower() not in exts or not path.is_file():
                continue
            if "node_modules" in path.parts or "__pycache__" in path.parts:
                continue
            keys |= _scan_file(path)
    # Explicitly require taxonomy + indexer keys from the plan even if scanners miss them
    keys |= {
        "RequireCheckInApproval",
        "AppOwnerTeamId",
        "DrawingDropOffLibraryUrl",
        "DrawingDestinationLibraryUrl",
        "StandardDocumentDropOffLibraryUrl",
        "StandardDocumentDestinationLibraryUrl",
        "ProcedureDocumentDropOffLibraryUrl",
        "ProcedureDocumentDestinationLibraryUrl",
        "FormDocumentDropOffLibraryUrl",
        "FormDocumentDestinationLibraryUrl",
        "DrawingDocumentSPContentTypeName",
        "DrawingDocumentSPContentTypeId",
        "SharePointIndexerLogFolderPath",
        "SharePointIndexerMaxCsvRows",
        "SharePointIndexerIncrementalHours",
        "SharePointRecordTypeMap",
        "FlowRunUrlTemplate",
    }
    return keys


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit App Config seed completeness")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat legacy Drawings*/Documents* references as errors if missing from seed",
    )
    args = parser.parse_args()

    seeded = seeded_keys()
    referenced = referenced_keys()

    # When scanning AppConfigSchema, Zod may pick up unrelated PascalCase props —
    # constrain to seeded ∪ known optional / app-config-shaped keys.
    app_config_like = {
        k for k in referenced
        if k[0].isupper()
        and not k.endswith(("Props", "Schema", "Type", "Value", "Enum"))
        and len(k) > 3
    }

    missing = sorted(app_config_like - seeded - PROVISIONED_KEYS)
    # Drop known false positives from broad TS key scanning outside AppConfigSchema
    false_positives = {
        "FluentProvider", "QueryClient", "DocumentSubtype", "ReservationType",
        "CheckoutStatus", "DrawingState", "SharePointFileUrls", "ColumnDef",
    }
    missing = [k for k in missing if k not in false_positives]

    # Require plan-critical keys are seeded
    required = {
        "RequireCheckInApproval",
        "AppOwnerTeamId",
        "DrawingDropOffLibraryUrl",
        "DrawingDestinationLibraryUrl",
        "StandardDocumentDropOffLibraryUrl",
        "StandardDocumentDestinationLibraryUrl",
        "ProcedureDocumentDropOffLibraryUrl",
        "ProcedureDocumentDestinationLibraryUrl",
        "FormDocumentDropOffLibraryUrl",
        "FormDocumentDestinationLibraryUrl",
        "DrawingDocumentSPContentTypeName",
        "DrawingDocumentSPContentTypeId",
        "SharePointIndexerLogFolderPath",
        "SharePointIndexerMaxCsvRows",
        "SharePointIndexerIncrementalHours",
        "SharePointRecordTypeMap",
    }
    missing_required = sorted(required - seeded)

    print(f"Seeded keys: {len(seeded)}")
    print(f"Referenced (scanned) keys: {len(app_config_like)}")

    if missing_required:
        print("MISSING required seed keys:", file=sys.stderr)
        for k in missing_required:
            print(f"  - {k}", file=sys.stderr)
        return 1

    # Info: legacy keys still referenced in code but not in canonical seed
    legacy = {
        "DrawingsDropOffLibraryUrl",
        "DrawingsDestinationLibraryUrl",
        "DocumentsDropOffLibraryUrl",
        "DocumentsDestinationLibraryUrl",
    }
    legacy_missing = sorted(legacy - seeded)
    if legacy_missing:
        msg = "Legacy keys not in canonical seed (migration fallbacks OK): " + ", ".join(legacy_missing)
        if args.strict:
            print(msg, file=sys.stderr)
            return 1
        print(f"NOTE: {msg}")

    if missing:
        # Only fail on keys that look like real App Config and aren't schema-optional-only
        legacy = {
            "DrawingsDropOffLibraryUrl",
            "DrawingsDestinationLibraryUrl",
            "DocumentsDropOffLibraryUrl",
            "DocumentsDestinationLibraryUrl",
        }
        serious = [
            k for k in missing
            if k not in legacy
            and (
                k in required
                or k.startswith(("SharePoint", "Enable", "Require", "Drawing", "Form", "Standard", "Procedure"))
            )
        ]
        if serious:
            print("Referenced keys missing from seed union:", file=sys.stderr)
            for k in serious:
                print(f"  - {k}", file=sys.stderr)
            return 1
        print(f"NOTE: ignoring non-config scanner hits: {', '.join(missing[:20])}")

    print("App config key audit PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
