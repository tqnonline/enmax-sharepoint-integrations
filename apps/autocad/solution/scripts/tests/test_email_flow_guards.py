"""Regression guards for thermos findings on email flows."""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
WORKFLOWS = REPO / "solution" / "src" / "Workflows"


def _load(name: str, file: str = "definition.json") -> dict:
    return json.loads((WORKFLOWS / name / file).read_text(encoding="utf-8"))


def test_checkout_updated_does_not_exclude_service_account_modifiedby() -> None:
    definition = _load("On_Checkout_Updated_Email_Notifications")
    filt = definition["triggers"]["When_Checkout_Updated"]["inputs"]["parameters"][
        "subscriptionRequest/filterexpression"
    ]
    assert "ServiceAccountUserId" not in filt
    assert "_modifiedby_value" not in filt
    assert "enmax_acdnstatus eq 1" in filt


def test_checkout_updated_escapes_submission_info_in_html() -> None:
    raw = (WORKFLOWS / "On_Checkout_Updated_Email_Notifications" / "definition.json").read_text(
        encoding="utf-8"
    )
    assert "enmax_acdnsubmissioninfo" in raw
    assert "replace(replace(coalesce(triggerOutputs()?['body/enmax_acdnsubmissioninfo']" in raw


def test_child_send_system_email_fails_closed_without_mailbox_or_to() -> None:
    definition = _load("Child_Send_System_Email")
    actions = definition["actions"]
    # Error scaffold nests business actions under Scope_Try_Main.
    scope = actions.get("Scope_Try_Main", {}).get("actions", actions)
    assert "Condition_Mailbox_Configured" in scope
    else_actions = scope["Condition_Mailbox_Configured"]["else"]["actions"]
    assert "Terminate_Missing_Config" in else_actions
    term = else_actions["Terminate_Missing_Config"]["inputs"]
    assert term["runStatus"] == "Failed"


def test_workflow_json_maps_outlook_and_dataverse_conrefs() -> None:
    workflow = _load("Child_Send_System_Email", "workflow.json")
    refs = workflow["properties"]["connectionReferences"]
    assert (
        refs["shared_office365"]["connection"]["connectionReferenceLogicalName"]
        == "enmax_autocadconrefOutlook"
    )
    assert (
        refs["shared_commondataserviceforapps"]["connection"]["connectionReferenceLogicalName"]
        == "enmax_autocadconrefDataverse"
    )


def test_shared_mailbox_uses_connector_operation_id() -> None:
    definition = _load("Child_Send_System_Email")
    raw = json.dumps(definition)
    assert "SharedMailboxSendEmailV2" in raw
    assert "SendEmailFromSharedMailbox_V2" not in raw
    assert "emailMessage/MailboxAddress" in raw


def test_child_flows_have_response_action() -> None:
    for name in (
        "Child_Send_System_Email",
        "Child_Send_Approval_Needed_Email",
        "Child_Send_Approval_Result_Email",
    ):
        actions = _load(name)["actions"]
        assert "Respond_to_Parent" in actions, name
        assert actions["Respond_to_Parent"]["type"] == "Response"


def test_reservation_flows_have_no_parallel_action() -> None:
    for name in (
        "On_Reservation_Approved_Issue_Drawings",
        "On_Reservation_Created_Notify_Admins",
    ):
        raw = json.dumps(_load(name))
        assert '"type": "Parallel"' not in raw, name
