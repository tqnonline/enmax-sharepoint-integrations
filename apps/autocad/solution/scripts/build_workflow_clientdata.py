#!/usr/bin/env python3
"""Wrap flow definition.json files with solution connection reference metadata.

Reads each solution/src/Workflows/*/definition.json and writes workflow.json in
solution export format, mapping connector keys to the enmax_autocadsln
connection references already deployed in DEV:

  shared_commondataserviceforapps -> enmax_autocadconrefDataverse
  shared_office365                -> enmax_autocadconrefOutlook
  shared_sharepointonline         -> enmax_autocadconrefSharePoint
  shared_teams                    -> enmax_autocadconrefTeams

Also normalizes the definition so Dataverse can activate the flow:
  - injects required $connections / $authentication parameters
  - adds authentication: @parameters('$authentication') on connector calls
  - escapes @odata.* property keys as @@odata.* (Logic Apps template syntax)

definition.json is left unchanged (source of truth); workflow.json is generated.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
WORKFLOWS_DIR = REPO_ROOT / "solution" / "src" / "Workflows"

CONNECTOR_TO_CONREF: dict[str, str] = {
    "shared_commondataserviceforapps": "enmax_autocadconrefDataverse",
    "shared_office365": "enmax_autocadconrefOutlook",
    "shared_sharepointonline": "enmax_autocadconrefSharePoint",
    "shared_teams": "enmax_autocadconrefTeams",
}

_CONN_NAME_RE = re.compile(r'"connectionName"\s*:\s*"([^"]+)"')
_CONNECTOR_TYPES = frozenset({"OpenApiConnection", "OpenApiConnectionWebhook"})


def _connectors_in_definition(definition: dict) -> set[str]:
    raw = json.dumps(definition)
    names = set(_CONN_NAME_RE.findall(raw))
    return {name for name in names if name in CONNECTOR_TO_CONREF}


def _connection_references(connectors: set[str]) -> dict:
    refs: dict = {}
    for connector in sorted(connectors):
        refs[connector] = {
            "runtimeSource": "embedded",
            "connection": {
                "connectionReferenceLogicalName": CONNECTOR_TO_CONREF[connector],
            },
            "api": {"name": connector},
        }
    return refs


def _escape_odata_keys(node: Any) -> Any:
    """Logic Apps treats @… as expressions; literal @odata.* keys need @@."""
    if isinstance(node, list):
        return [_escape_odata_keys(x) for x in node]
    if not isinstance(node, dict):
        return node
    out: dict[str, Any] = {}
    for key, value in node.items():
        new_key = key.replace("@odata.", "@@odata.") if "@odata." in key else key
        out[new_key] = _escape_odata_keys(value)
    return out


def _inject_connector_auth(node: Any) -> Any:
    """Ensure OpenApiConnection* steps carry authentication=@parameters('$authentication')."""
    if isinstance(node, list):
        return [_inject_connector_auth(x) for x in node]
    if not isinstance(node, dict):
        return node

    out: dict[str, Any] = {}
    for key, value in node.items():
        out[key] = _inject_connector_auth(value)

    if out.get("type") in _CONNECTOR_TYPES:
        inputs = out.setdefault("inputs", {})
        if isinstance(inputs, dict) and "authentication" not in inputs:
            inputs["authentication"] = "@parameters('$authentication')"
    return out


def _normalize_definition(body: dict) -> dict:
    """Build a Power Automate-compatible definition object from definition.json body."""
    definition = {
        "$schema": (
            "https://schema.management.azure.com/providers/"
            "Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#"
        ),
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$connections": {"defaultValue": {}, "type": "Object"},
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
        },
    }
    # Prefer triggers/actions from body; keep other keys (e.g. metadata) if present.
    for key, value in body.items():
        if key in {"$schema", "contentVersion", "parameters"}:
            continue
        definition[key] = value

    definition = _escape_odata_keys(definition)
    definition = _inject_connector_auth(definition)
    return definition


def wrap_flow(flow_dir: Path) -> bool:
    definition_path = flow_dir / "definition.json"
    if not definition_path.exists():
        return False

    import build_flow_error_handling as bfe  # noqa: WPS433 — script sibling import

    raw = json.loads(definition_path.read_text(encoding="utf-8"))
    definition = bfe.wrap_definition(
        raw,
        folder_slug=flow_dir.name,
        display_name=bfe.load_flow_catalog().get(flow_dir.name, {}).get("displayName", flow_dir.name),
    )
    schema_version = definition.get("schemaVersion", "1.0.0.0")
    body = {k: v for k, v in definition.items() if k != "schemaVersion"}
    connectors = _connectors_in_definition(definition)

    clientdata = {
        "schemaVersion": schema_version,
        "properties": {
            "connectionReferences": _connection_references(connectors),
            "definition": _normalize_definition(body),
            "templateName": "",
        },
    }

    out_path = flow_dir / "workflow.json"
    out_path.write_text(json.dumps(clientdata, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path.relative_to(REPO_ROOT)} ({', '.join(sorted(connectors)) or 'no managed connectors'})")
    return True


def main() -> int:
    if not WORKFLOWS_DIR.is_dir():
        print(f"ERROR: missing {WORKFLOWS_DIR}", file=sys.stderr)
        return 1

    count = 0
    for flow_dir in sorted(WORKFLOWS_DIR.iterdir()):
        if flow_dir.is_dir() and wrap_flow(flow_dir):
            count += 1

    print(f"Wrapped {count} flow(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
