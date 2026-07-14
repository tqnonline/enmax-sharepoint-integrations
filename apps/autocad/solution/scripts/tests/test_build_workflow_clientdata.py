"""Tests for build_workflow_clientdata.py."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

import build_workflow_clientdata as bw  # noqa: E402


def test_connection_references_map_deployed_logical_names() -> None:
    refs = bw._connection_references(
        {"shared_commondataserviceforapps", "shared_office365", "shared_sharepointonline"}
    )
    assert (
        refs["shared_commondataserviceforapps"]["connection"]["connectionReferenceLogicalName"]
        == "enmax_autocadconrefDataverse"
    )
    assert (
        refs["shared_office365"]["connection"]["connectionReferenceLogicalName"]
        == "enmax_autocadconrefOutlook"
    )
    assert (
        refs["shared_sharepointonline"]["connection"]["connectionReferenceLogicalName"]
        == "enmax_autocadconrefSharePoint"
    )


def test_child_send_system_email_workflow_json_uses_solution_conrefs() -> None:
    workflow_path = (
        Path(__file__).resolve().parent.parent.parent
        / "src"
        / "Workflows"
        / "Child_Send_System_Email"
        / "workflow.json"
    )
    assert workflow_path.exists(), "run build_workflow_clientdata.py to generate workflow.json"
    data = json.loads(workflow_path.read_text(encoding="utf-8"))
    conrefs = data["properties"]["connectionReferences"]
    assert "enmax_autocadconrefDataverse" in json.dumps(conrefs)
    assert "enmax_autocadconrefOutlook" in json.dumps(conrefs)
    assert "shared_commondataserviceforapps" in conrefs
    assert "shared_office365" in conrefs
