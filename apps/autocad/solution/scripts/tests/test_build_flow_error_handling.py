"""Tests for build_flow_error_handling.py."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

import build_flow_error_handling as bfe  # noqa: E402


def test_wraps_parent_flow_with_try_catch_and_logger() -> None:
    definition = {
        "triggers": {
            "When_Reservation_Created": {
                "type": "OpenApiConnectionWebhook",
                "inputs": {
                    "parameters": {
                        "subscriptionRequest/entityname": "enmax_autocadreservation",
                    }
                },
            }
        },
        "actions": {
            "Get_Config": {"type": "Compose", "runAfter": {}, "inputs": "x"},
        },
    }
    wrapped = bfe.wrap_definition(
        definition,
        folder_slug="On_Reservation_Created_Notify_Admins",
        display_name="Enmax AutoCAD | On Create of Reservation | Notify",
    )
    actions = wrapped["actions"]
    assert "Initialize_CorrelationId" in actions
    assert "Scope_Try_Main" in actions
    assert "Scope_Catch_Failure" in actions
    assert "Get_Config" in actions["Scope_Try_Main"]["actions"]
    assert "InitializeVariable" not in {
        a.get("type") for a in actions["Scope_Try_Main"]["actions"].values()
    }
    catch = actions["Scope_Catch_Failure"]["actions"]
    assert catch["Invoke_Log_Flow_Exception"]["inputs"]["host"]["workflowReferenceName"] == "Child_Log_Flow_Exception"
    body = catch["Invoke_Log_Flow_Exception"]["inputs"]["body"]
    assert body["SubjectTable"] == "enmax_autocadreservation"
    compose = catch["Compose_Error_Context"]["inputs"]
    assert "first(result('Scope_Try_Main'))" in compose["failedAction"]
    assert "result('Scope_Try_Main')?['error']" not in compose["errorMessage"]


def test_skips_child_logger_flow() -> None:
    definition = {"actions": {"Create_Exception_Record": {"type": "Compose", "runAfter": {}, "inputs": "x"}}}
    wrapped = bfe.wrap_definition(
        definition,
        folder_slug="Child_Log_Flow_Exception",
        display_name="Enmax AutoCAD | Internal | Log Flow Exception",
    )
    assert wrapped == definition


def test_admin_flow_uses_admin_exception_logger() -> None:
    definition = {
        "actions": {
            "Get_Config": {"type": "Compose", "runAfter": {}, "inputs": "x"},
        },
    }
    wrapped = bfe.wrap_definition(
        definition,
        folder_slug="UAT_Seed_SharePoint_Test_PDFs",
        display_name="Enmax AutoCAD | On Demand | UAT Seed SharePoint Test PDFs",
    )
    logger = wrapped["actions"]["Scope_Catch_Failure"]["actions"]["Invoke_Log_Flow_Exception"]
    assert logger["inputs"]["host"]["workflowReferenceName"] == "Admin_Child_Log_Flow_Exception"


def test_skips_admin_child_logger_flow() -> None:
    definition = {"actions": {"Create_Exception_Record": {"type": "Compose", "runAfter": {}, "inputs": "x"}}}
    wrapped = bfe.wrap_definition(
        definition,
        folder_slug="Admin_Child_Log_Flow_Exception",
        display_name="Enmax AutoCAD Admin | Internal | Log Flow Exception",
    )
    assert wrapped == definition


def test_hoists_initialize_variable_outside_try_scope() -> None:
    # PA forbids InitializeVariable inside Scope — bootstrap + hoist inits to root,
    # business actions (beyond init predecessors) go in Scope_Try_Main.
    definition = {
        "actions": {
            "Get_Config": {
                "type": "OpenApiConnection",
                "runAfter": {},
                "inputs": {},
            },
            "Initialize_RequesterContext": {
                "type": "InitializeVariable",
                "runAfter": {"Get_Config": ["Succeeded"]},
                "inputs": {"variables": [{"name": "RequesterDisplayName", "type": "string", "value": "x"}]},
            },
            "Send_Email": {
                "type": "Compose",
                "runAfter": {"Initialize_RequesterContext": ["Succeeded"]},
                "inputs": "x",
            },
        }
    }
    wrapped = bfe.wrap_definition(definition, folder_slug="Test_Flow", display_name="Test")
    actions = wrapped["actions"]
    assert "Initialize_CorrelationId" in actions
    assert "Scope_Try_Main" in actions
    assert "Scope_Catch_Failure" in actions
    assert "Initialize_RequesterContext" in actions  # hoisted
    assert "Get_Config" in actions  # predecessor of init, hoisted
    assert "Send_Email" in actions["Scope_Try_Main"]["actions"]
    assert actions["Scope_Try_Main"]["actions"]["Send_Email"].get("runAfter") == {}


def test_scoped_actions_do_not_run_after_hoisted_inits() -> None:
    definition = {
        "actions": {
            "Get_Config": {"type": "OpenApiConnection", "runAfter": {}, "inputs": {}},
            "Initialize_RequesterContext": {
                "type": "InitializeVariable",
                "runAfter": {"Get_Config": ["Succeeded"]},
                "inputs": {"variables": [{"name": "RequesterDisplayName", "type": "string", "value": "x"}]},
            },
            "Get_Business_Row": {
                "type": "OpenApiConnection",
                "runAfter": {"Initialize_RequesterContext": ["Succeeded"]},
                "inputs": {},
            },
            "Send_Email": {
                "type": "Compose",
                "runAfter": {"Get_Business_Row": ["Succeeded"]},
                "inputs": "x",
            },
        }
    }
    wrapped = bfe.wrap_definition(definition, folder_slug="Test_Flow", display_name="Test")
    scope_actions = wrapped["actions"]["Scope_Try_Main"]["actions"]
    assert scope_actions["Get_Business_Row"].get("runAfter") == {}
    assert scope_actions["Send_Email"]["runAfter"] == {"Get_Business_Row": ["Succeeded"]}


def test_repairs_already_wrapped_scoped_run_after() -> None:
    wrapped = {
        "actions": {
            "Initialize_CorrelationId": {"type": "InitializeVariable", "runAfter": {}, "inputs": {}},
            "Initialize_RequesterContext": {
                "type": "InitializeVariable",
                "runAfter": {},
                "inputs": {"variables": [{"name": "RequesterDisplayName", "type": "string", "value": "x"}]},
            },
            "Scope_Try_Main": {
                "type": "Scope",
                "runAfter": {"Initialize_RequesterContext": ["Succeeded"]},
                "actions": {
                    "Get_Business_Row": {
                        "type": "OpenApiConnection",
                        "runAfter": {"Initialize_RequesterContext": ["Succeeded"]},
                        "inputs": {},
                    }
                },
            },
            "Scope_Catch_Failure": {"type": "Scope", "runAfter": {"Scope_Try_Main": ["Failed"]}, "actions": {}},
        }
    }
    repaired = bfe.repair_wrapped_scoped_run_after(wrapped)
    assert repaired["actions"]["Scope_Try_Main"]["actions"]["Get_Business_Row"]["runAfter"] == {}


def test_injects_correlation_on_child_workflow_calls() -> None:
    definition = {
        "actions": {
            "Send_Email": {
                "type": "Workflow",
                "runAfter": {},
                "inputs": {
                    "host": {"workflowReferenceName": "Child_Send_System_Email"},
                    "body": {"To": "a@b.com"},
                },
            }
        }
    }
    wrapped = bfe.wrap_definition(definition, folder_slug="Test_Flow", display_name="Test")
    inner = wrapped["actions"]["Scope_Try_Main"]["actions"]["Send_Email"]["inputs"]["body"]
    assert inner["CorrelationId"] == "@{variables('CorrelationId')}"
