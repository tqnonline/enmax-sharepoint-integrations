"""Tests for build_workflow_clientdata.py."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

import build_workflow_clientdata as bw  # noqa: E402
import flow_catalog as fc  # noqa: E402


def test_connection_references_map_deployed_logical_names() -> None:
    refs = bw._connection_references(
        {
            "shared_commondataserviceforapps",
            "shared_office365",
            "shared_sharepointonline",
            "shared_teams",
        },
        fc.CONNECTOR_TO_CONREF_PROD,
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
    assert (
        refs["shared_teams"]["connection"]["connectionReferenceLogicalName"]
        == "enmax_autocadconrefTeams"
    )


def test_reservation_created_workflow_json_has_error_scaffold() -> None:
    workflow_path = (
        Path(__file__).resolve().parent.parent.parent
        / "src"
        / "Workflows"
        / "On_Reservation_Created_Notify_Admins"
        / "workflow.json"
    )
    assert workflow_path.exists(), "run build_workflow_clientdata.py to generate workflow.json"
    data = json.loads(workflow_path.read_text(encoding="utf-8"))
    actions = data["properties"]["definition"]["actions"]
    assert "Scope_Try_Main" in actions
    assert "Scope_Catch_Failure" in actions


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


def test_admin_uat_workflow_json_uses_admin_conrefs() -> None:
    workflow_path = (
        Path(__file__).resolve().parent.parent.parent
        / "src"
        / "Workflows"
        / "UAT_Seed_SharePoint_Test_PDFs"
        / "workflow.json"
    )
    assert workflow_path.exists(), "run build_workflow_clientdata.py to generate workflow.json"
    data = json.loads(workflow_path.read_text(encoding="utf-8"))
    conrefs = data["properties"]["connectionReferences"]
    assert "enmax_autocadconrefADMSharePoint" in json.dumps(conrefs)
    assert "enmax_autocadconrefSharePoint" not in json.dumps(conrefs)


def test_admin_exception_logger_workflow_json_uses_admin_dataverse_conref() -> None:
    workflow_path = (
        Path(__file__).resolve().parent.parent.parent
        / "src"
        / "Workflows"
        / "Admin_Child_Log_Flow_Exception"
        / "workflow.json"
    )
    assert workflow_path.exists(), "run build_workflow_clientdata.py to generate workflow.json"
    data = json.loads(workflow_path.read_text(encoding="utf-8"))
    conref = (
        data["properties"]["connectionReferences"]["shared_commondataserviceforapps"]
        ["connection"]["connectionReferenceLogicalName"]
    )
    assert conref == "enmax_autocadconrefADMDataverse"
