"""Regression guards for thermos findings on email flows."""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
WORKFLOWS = REPO / "solution" / "src" / "Workflows"
SEED = REPO / "solution" / "seed"

# The Code App is served from a per-environment play URL
# (https://apps.powerapps.com/play/e/{env}/app/{app}). The Power Apps player drops
# the URL fragment on launch, so deep links must ride as a query string
# ("{CodeAppBaseUrl}?target=<key>&id=<id>"); DeepLinkBootstrap resolves them to the
# internal hash route on boot. A bare "{base}/route", a legacy "#/route", or the
# literal "play/e/default" env id all fail (NotFound / EnvironmentIdInvalid).
_RESERVATION_DEEPLINK_BY_LOOKUP = (
    "'?target=reservation&id=', outputs('Get_Reservation')?['body/enmax_autocadreservationid']"
)
_RESERVATION_DEEPLINK_BY_TRIGGER = (
    "'?target=reservation&id=', triggerOutputs()?['body/enmax_autocadreservationid']"
)


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


def test_email_flows_send_as_connection_owner_via_sendemailv2() -> None:
    """Email is sent with Office 365 SendEmailV2 (as the connection owner), not the
    shared-mailbox operation. The service-account shared mailbox has no Exchange
    Online / REST mailbox, so SharedMailboxSendEmailV2 returns MailboxNotEnabledForRESTAPI.
    No send action may carry an emailMessage/MailboxAddress parameter."""
    for name in (
        "Child_Send_System_Email",
        "Child_Send_Approval_Needed_Email",
        "Child_Send_Approval_Result_Email",
    ):
        raw = json.dumps(_load(name))
        assert "SendEmailV2" in raw, name
        assert "SharedMailboxSendEmailV2" not in raw, name
        assert "emailMessage/MailboxAddress" not in raw, name


def test_child_flows_have_response_action() -> None:
    for name in (
        "Child_Send_System_Email",
        "Child_Send_Approval_Needed_Email",
        "Child_Send_Approval_Result_Email",
    ):
        actions = _load(name)["actions"]
        assert "Respond_to_Parent" in actions, name
        assert actions["Respond_to_Parent"]["type"] == "Response"


def test_checkout_emails_deep_link_to_reservation_detail_via_query_param() -> None:
    """Creator lifecycle emails must open the specific reservation, not a bare path."""
    for name in (
        "On_Checkout_Created_Email_Notifications",
        "On_Checkout_Updated_Email_Notifications",
    ):
        raw = json.dumps(_load(name))
        assert _RESERVATION_DEEPLINK_BY_LOOKUP in raw, name
        # No legacy path-style or hash links the player cannot resolve.
        assert "')}/my-items" not in raw, name
        assert "')}/approvals" not in raw, name
        assert "#/reservations" not in raw, name


def test_doccontrol_queue_links_are_query_param_deep_links() -> None:
    created = json.dumps(_load("On_Checkout_Created_Email_Notifications"))
    assert "}?target=approvals&amp;section=documents&amp;tab=checkout" in created
    assert "#/approvals" not in created
    updated = json.dumps(_load("On_Checkout_Updated_Email_Notifications"))
    assert "}?target=approvals&amp;section=documents&amp;tab=checkin" in updated
    assert "#/approvals" not in updated


def test_no_flow_uses_legacy_hash_deep_links() -> None:
    """The player drops the URL fragment; no flow may emit a #/route deep link."""
    for flow_dir in WORKFLOWS.iterdir():
        for file in ("definition.json", "workflow.json"):
            path = flow_dir / file
            if not path.exists():
                continue
            raw = path.read_text(encoding="utf-8")
            assert "#/reservations" not in raw, f"{flow_dir.name}/{file}"
            assert "#/approvals" not in raw, f"{flow_dir.name}/{file}"


def test_reservation_result_and_pending_emails_deep_link_to_reservation() -> None:
    for name in (
        "On_Reservation_Created_Notify_Admins",
        "On_Reservation_Approved_Issue_Drawings",
        "On_Reservation_Declined_Notify_Requester",
    ):
        raw = json.dumps(_load(name))
        assert _RESERVATION_DEEPLINK_BY_TRIGGER in raw, name


def test_codeapp_base_url_seed_is_full_app_url_not_default_env() -> None:
    """CodeAppBaseUrl must be the full /app/{appId} play URL, never /play/e/default."""
    base = (SEED / "app_config.yaml").read_text(encoding="utf-8")
    assert "play/e/default'" not in base
    dev = (SEED / "app_config.dev.yaml").read_text(encoding="utf-8")
    assert "CodeAppBaseUrl" in dev
    assert "play/e/default'" not in dev
    assert "/app/" in dev


def test_reservation_flows_have_no_parallel_action() -> None:
    for name in (
        "On_Reservation_Approved_Issue_Drawings",
        "On_Reservation_Created_Notify_Admins",
    ):
        raw = json.dumps(_load(name))
        assert '"type": "Parallel"' not in raw, name


def test_approval_needed_email_tells_the_story_who_and_what() -> None:
    """The approver must see who sent it, what it is, and the coding sequence
    without opening the app. If any of these stop being passed the email degrades
    to a bare id + code and the guard fails."""
    parent = json.dumps(_load("On_Reservation_Created_Notify_Admins"))
    # Parent resolves the requester email, human type/subtype label, submitted
    # timestamp, new-vs-existing intent, and the coding-sequence codes.
    assert "outputs('Get_Requester_User')?['body/internalemailaddress']" in parent
    assert "enmax_acdndocumentsubtype@OData.Community.Display.V1.FormattedValue" in parent
    assert "Add to an existing base number" in parent
    # Coding sequence mirrors the detail page: per-part CODES (not names).
    for row in ("Get_Business_Row", "Get_Asset_Row", "Get_Unit_Row", "Get_Domain_Row", "Get_System_Row", "Get_Kind_Row"):
        assert f"outputs('{row}')?['body/enmax_acdncode']" in parent, row
    # Parent hands each story field to the child.
    for field in ("RequesterEmail", "TypeLabel", "TypeNoun", "SubmittedOn", "RequestKind", "CodingSequence"):
        assert f'"{field}":' in parent, field
    # Subject noun follows the reservation type (drawing vs document), lower-cased.
    assert "toLower(coalesce(triggerOutputs()?['body/enmax_acdnreservationtype@OData.Community.Display.V1.FormattedValue']" in parent

    # Child substitutes each story placeholder into the template.
    child = json.dumps(_load("Child_Send_Approval_Needed_Email"))
    for token in ("{{RequesterEmail}}", "{{TypeLabel}}", "{{SubmittedOn}}", "{{RequestKind}}", "{{CodingSequence}}"):
        assert token in child, token
    # Free-text-ish story fields are HTML-escaped like the existing ones.
    assert "replace(replace(coalesce(triggerBody()?['CodingSequence'], ''), '<', '&lt;')" in child
    # Subject reads as a sentence: "...for new {type} reservation for {code} from {name}."
    subject = _load("Child_Send_Approval_Needed_Email")["actions"]["Scope_Try_Main"][
        "actions"
    ]["Send_Email"]["inputs"]["parameters"]["emailMessage/Subject"]
    assert subject.startswith("Approval needed for new @{coalesce(triggerBody()?['TypeNoun'], 'drawing')} reservation for ")
    assert subject.endswith("from @{triggerBody()?['RequesterDisplayName']}.")

    # Template renders the story fields.
    tpl = (
        REPO / "solution" / "src" / "WebResources" / "email_templates" / "approval_needed.html"
    ).read_text(encoding="utf-8")
    for token in ("{{TypeLabel}}", "{{RequesterEmail}}", "{{SubmittedOn}}", "{{CodingSequence}}", "{{RequestKind}}"):
        assert token in tpl, token
    # Uses the app's canonical terminology for the label.
    assert "Coding Sequence" in tpl


def test_all_emails_embed_enmax_logo_via_cid_attachment() -> None:
    """The ENMAX wordmark is delivered as an inline cid attachment (Outlook does
    not render SVG or data-URI logos). Every send action must fetch the logo web
    resource and attach it as enmax_logo_white.png, and every HTML surface must
    reference cid:enmax_logo_white.png rather than a text wordmark or SVG."""
    # Child flows fetch the logo and attach it as a cid-named PNG.
    for name in (
        "Child_Send_System_Email",
        "Child_Send_Approval_Needed_Email",
        "Child_Send_Approval_Result_Email",
    ):
        raw = json.dumps(_load(name))
        assert "name eq 'enmax_logo_white'" in raw, name
        assert '"Name": "enmax_logo_white.png"' in raw, name
        assert "\"ContentBytes\": \"@{outputs('Get_Logo')?['body/value'][0]?['content']}\"" in raw, name

    # Inline checkout HTML references the cid image, no leftover text wordmark.
    for name in ("On_Checkout_Created_Email_Notifications", "On_Checkout_Updated_Email_Notifications"):
        raw = json.dumps(_load(name))
        assert "cid:enmax_logo_white.png" in raw, name
        assert ">ENMAX</div>" not in raw, name

    # HTML templates reference the cid image, no leftover text wordmark.
    tpl_dir = REPO / "solution" / "src" / "WebResources" / "email_templates"
    for fname in ("approval_needed.html", "approval_approved.html", "approval_declined.html"):
        html = (tpl_dir / fname).read_text(encoding="utf-8")
        assert "cid:enmax_logo_white.png" in html, fname
        assert '<div class="brand">ENMAX</div>' not in html, fname

    # The logo asset exists and the deploy script upserts it as a PNG web resource.
    assert (REPO / "solution" / "src" / "WebResources" / "images" / "enmax_logo_white.png").is_file()
    deploy = (REPO / "solution" / "scripts" / "deploy_email_webresources.py").read_text(encoding="utf-8")
    assert '"enmax_logo_white"' in deploy
    assert "WEB_RESOURCE_TYPE_PNG = 5" in deploy


def _subject(name: str, path: list[str]) -> str:
    node = _load(name)["actions"]
    for key in path[:-1]:
        node = node[key]
    return node[path[-1]]["inputs"]["parameters"]["emailMessage/Subject"]


def test_result_email_subjects_are_sentences_without_res_id() -> None:
    """Approved/Declined subjects read as sentences by type + requester and must
    not leak the internal RES-XXXX reservation number."""
    approved = _subject(
        "Child_Send_Approval_Result_Email",
        ["Scope_Try_Main", "actions", "Choose_Template", "cases", "Approved", "actions", "Send_Approved_Email"],
    )
    declined = _subject(
        "Child_Send_Approval_Result_Email",
        ["Scope_Try_Main", "actions", "Choose_Template", "cases", "Declined", "actions", "Send_Declined_Email"],
    )
    assert approved == (
        "Approved: new @{coalesce(triggerBody()?['TypeNoun'], 'drawing')} reservation "
        "@{triggerBody()?['IssuedNumbersFormatted']} for @{triggerBody()?['RequesterDisplayName']}."
    )
    assert declined == (
        "Declined: new @{coalesce(triggerBody()?['TypeNoun'], 'drawing')} reservation "
        "for @{triggerBody()?['RequesterDisplayName']}."
    )
    # No RES-XXXX autonumber in either subject.
    for subject in (approved, declined):
        assert "ReservationId" not in subject
    # Parents feed the type noun + requester name so the child can render them.
    for name in ("On_Reservation_Approved_Issue_Drawings", "On_Reservation_Declined_Notify_Requester"):
        raw = json.dumps(_load(name))
        assert "toLower(coalesce(triggerOutputs()?['body/enmax_acdnreservationtype@OData.Community.Display.V1.FormattedValue']" in raw, name
        assert '"TypeNoun":' in raw, name
        assert '"RequesterDisplayName":' in raw, name


def test_checkout_subjects_name_document_and_person() -> None:
    """Checkout subjects read as sentences naming the document and the actor."""
    created = json.dumps(_load("On_Checkout_Created_Email_Notifications"), ensure_ascii=False)
    assert "Check-out approval needed for @{outputs('Compose_Document_Number')} requested by @{triggerOutputs()?['body/_enmax_acdncheckedoutby_value@OData.Community.Display.V1.FormattedValue']}." in created
    assert "@{outputs('Compose_Document_Number')} is now checked out to @{triggerOutputs()?['body/_enmax_acdncheckedoutby_value@OData.Community.Display.V1.FormattedValue']}." in created

    updated = json.dumps(_load("On_Checkout_Updated_Email_Notifications"), ensure_ascii=False)
    assert "Check-in validation needed for @{outputs('Compose_Document_Number')} submitted by @{triggerOutputs()?['body/_ownerid_value@OData.Community.Display.V1.FormattedValue']}." in updated
    assert "Check-in submitted for @{outputs('Compose_Document_Number')} — pending validation." in updated
    assert "@{outputs('Compose_Document_Number')} is now checked in — revision complete." in updated
    # Old label-prefix subjects are gone.
    for legacy in ('"Subject": "Checked out: ', '"Subject": "Check In validation needed: ', '"Subject": "Checked in: '):
        assert legacy not in updated
