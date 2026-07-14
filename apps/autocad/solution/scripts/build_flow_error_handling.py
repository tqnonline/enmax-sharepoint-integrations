#!/usr/bin/env python3
"""Inject correlation id, try/catch scopes, and child exception logger into flow definitions."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from flow_catalog import load_flow_catalog, load_flow_run_url_template

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

SKIP_WRAP = frozenset({"Child_Log_Flow_Exception"})
RESPONSE_ACTIONS = frozenset({"Respond_to_Parent"})
CHILD_LOGGER_SLUG = "Child_Log_Flow_Exception"

# result('Scope_Try_Main') is an action-result array; pick the first entry (failed scope action).
_SCOPE_RESULTS = "result('Scope_Try_Main')"
_FIRST_SCOPE_RESULT = f"first({_SCOPE_RESULTS})"
_ERROR_CONTEXT_COMPOSE = {
    "failedAction": f"@{{coalesce({_FIRST_SCOPE_RESULT}?['name'], 'Scope_Try_Main')}}",
    "errorMessage": f"@{{coalesce({_FIRST_SCOPE_RESULT}?['error']?['message'], 'Flow failed')}}",
    "errorCode": f"@{{coalesce({_FIRST_SCOPE_RESULT}?['error']?['code'], 'FlowFailed')}}",
    "errorDetail": f"@{{string({_SCOPE_RESULTS})}}",
}


def _webhook_entity_name(triggers: dict[str, Any]) -> str | None:
    for trigger in triggers.values():
        if not isinstance(trigger, dict):
            continue
        params = trigger.get("inputs", {}).get("parameters", {})
        entity = params.get("subscriptionRequest/entityname")
        if isinstance(entity, str) and entity:
            return entity
    return None


def _subject_id_expression(entity_logical: str) -> str:
    pk = f"{entity_logical}id"
    return f"@{{triggerOutputs()?['body/{pk}']}}"


def _infer_exception_logging(definition: dict[str, Any]) -> dict[str, str]:
    explicit = definition.get("exceptionLogging")
    if isinstance(explicit, dict):
        out: dict[str, str] = {}
        if explicit.get("subjectTable"):
            out["subjectTable"] = str(explicit["subjectTable"])
        if explicit.get("subjectIdExpression"):
            out["subjectIdExpression"] = str(explicit["subjectIdExpression"])
        return out
    entity = _webhook_entity_name(definition.get("triggers") or {})
    if entity:
        return {
            "subjectTable": entity,
            "subjectIdExpression": _subject_id_expression(entity),
        }
    return {}


def _already_wrapped(actions: dict[str, Any]) -> bool:
    return "Scope_Try_Main" in actions and "Initialize_CorrelationId" in actions


def _inject_correlation_on_child_calls(actions: dict[str, Any]) -> None:
    for action in actions.values():
        if not isinstance(action, dict):
            continue
        if action.get("type") != "Workflow":
            continue
        inputs = action.setdefault("inputs", {})
        body = inputs.setdefault("body", {})
        if isinstance(body, dict) and "CorrelationId" not in body:
            body["CorrelationId"] = "@{variables('CorrelationId')}"


def _root_action_names(actions: dict[str, Any]) -> set[str]:
    """InitializeVariable cannot live inside Scope — hoist vars and their predecessors."""
    roots = {name for name, action in actions.items() if action.get("type") == "InitializeVariable"}
    queue = list(roots)
    while queue:
        name = queue.pop()
        action = actions.get(name, {})
        for dep in (action.get("runAfter") or {}):
            if dep in actions and dep not in roots:
                roots.add(dep)
                queue.append(dep)
    return roots


def _scope_run_after(
    scoped: dict[str, Any],
    hoisted: dict[str, Any],
    *,
    bootstrap_last: str,
) -> dict[str, list[str]]:
    preds: set[str] = set()
    for action in scoped.values():
        for dep in (action.get("runAfter") or {}):
            if dep in hoisted:
                preds.add(dep)
    if not preds:
        return {bootstrap_last: ["Succeeded"]}
    return {name: ["Succeeded"] for name in sorted(preds)}


def _fix_hoisted_entry_run_after(hoisted: dict[str, Any], bootstrap_last: str) -> None:
    """Actions hoisted to root with runAfter {} should start after bootstrap inits."""
    for name, action in hoisted.items():
        if not action.get("runAfter"):
            action["runAfter"] = {bootstrap_last: ["Succeeded"]}


def wrap_definition(definition: dict[str, Any], *, folder_slug: str, display_name: str) -> dict[str, Any]:
    """Return a copy of definition with standard error-handling scaffold."""
    if folder_slug in SKIP_WRAP:
        return definition

    actions = definition.get("actions")
    if not isinstance(actions, dict) or _already_wrapped(actions):
        return definition

    exception_meta = _infer_exception_logging(definition)
    flow_run_template = load_flow_run_url_template()
    subject_table = exception_meta.get("subjectTable", "")
    subject_id_expr = exception_meta.get("subjectIdExpression", "")

    response_actions = {k: v for k, v in actions.items() if k in RESPONSE_ACTIONS}
    try_actions = {k: v for k, v in actions.items() if k not in RESPONSE_ACTIONS}

    _inject_correlation_on_child_calls(try_actions)

    # Always use Scope_Try_Main / Scope_Catch_Failure. InitializeVariable actions are
    # hoisted to the root (PA forbids Declare Variable inside Scope). Do not use a
    # correlation-only "light wrap" — that skips durable exception logging.
    root_names = _root_action_names(try_actions)
    hoisted = {k: copy.deepcopy(v) for k, v in try_actions.items() if k in root_names}
    scoped = {k: copy.deepcopy(v) for k, v in try_actions.items() if k not in root_names}
    _fix_hoisted_entry_run_after(hoisted, "Initialize_FlowRunUrlTemplate")

    wrapped: dict[str, Any] = {
        "Initialize_CorrelationId": {
            "type": "InitializeVariable",
            "runAfter": {},
            "inputs": {
                "variables": [
                    {
                        "name": "CorrelationId",
                        "type": "string",
                        "value": "@{coalesce(triggerBody()?['CorrelationId'], guid())}",
                    }
                ]
            },
        },
        "Initialize_FlowDisplayName": {
            "type": "InitializeVariable",
            "runAfter": {"Initialize_CorrelationId": ["Succeeded"]},
            "inputs": {
                "variables": [
                    {
                        "name": "FlowDisplayName",
                        "type": "string",
                        "value": display_name,
                    }
                ]
            },
        },
        "Initialize_FlowRunUrlTemplate": {
            "type": "InitializeVariable",
            "runAfter": {"Initialize_FlowDisplayName": ["Succeeded"]},
            "inputs": {
                "variables": [
                    {
                        "name": "FlowRunUrlTemplate",
                        "type": "string",
                        "value": flow_run_template,
                    }
                ]
            },
        },
        **hoisted,
        "Scope_Try_Main": {
            "type": "Scope",
            "runAfter": _scope_run_after(scoped, hoisted, bootstrap_last="Initialize_FlowRunUrlTemplate"),
            "actions": scoped,
        },
        "Scope_Catch_Failure": {
            "type": "Scope",
            "runAfter": {"Scope_Try_Main": ["Failed", "TimedOut"]},
            "actions": {
                "Compose_Error_Context": {
                    "type": "Compose",
                    "runAfter": {},
                    "inputs": _ERROR_CONTEXT_COMPOSE,
                },
                "Compose_FlowRunUrl": {
                    "type": "Compose",
                    "runAfter": {"Compose_Error_Context": ["Succeeded"]},
                    "inputs": "@{replace(replace(replace(variables('FlowRunUrlTemplate'), '{environmentId}', coalesce(workflow()?['tags']?['environmentName'], '')), '{flowId}', coalesce(workflow()?['name'], '')), '{runId}', coalesce(workflow()?['run']?['name'], ''))}",
                },
                "Invoke_Log_Flow_Exception": {
                    "type": "Workflow",
                    "runAfter": {"Compose_FlowRunUrl": ["Succeeded"]},
                    "inputs": {
                        "host": {"workflowReferenceName": CHILD_LOGGER_SLUG},
                        "body": {
                            "Origin": 1,
                            "FlowDisplayName": "@{variables('FlowDisplayName')}",
                            "FailedAction": "@{outputs('Compose_Error_Context')?['failedAction']}",
                            "ErrorMessage": "@{outputs('Compose_Error_Context')?['errorMessage']}",
                            "ErrorCode": "@{outputs('Compose_Error_Context')?['errorCode']}",
                            "ErrorDetail": "@{outputs('Compose_Error_Context')?['errorDetail']}",
                            "FlowRunId": "@{workflow()?['run']?['name']}",
                            "FlowRunUrl": "@{outputs('Compose_FlowRunUrl')}",
                            "CorrelationId": "@{variables('CorrelationId')}",
                            "SubjectTable": subject_table,
                            "SubjectId": subject_id_expr,
                            "Severity": 2,
                        },
                    },
                },
                "Terminate_Failed": {
                    "type": "Terminate",
                    "runAfter": {"Invoke_Log_Flow_Exception": ["Succeeded", "Failed", "Skipped", "TimedOut"]},
                    "inputs": {
                        "runStatus": "Failed",
                        "runError": {
                            "code": "@{outputs('Compose_Error_Context')?['errorCode']}",
                            "message": "@{outputs('Compose_Error_Context')?['errorMessage']}",
                        },
                    },
                },
            },
        },
    }

    for name, action in response_actions.items():
        wrapped[name] = copy.deepcopy(action)
        wrapped[name]["runAfter"] = {
            "Scope_Try_Main": ["Succeeded", "Failed", "TimedOut", "Skipped"],
        }

    out = copy.deepcopy(definition)
    out["actions"] = wrapped
    return out


def apply_to_definition_file(definition_path: Path, *, folder_slug: str) -> bool:
    catalog = load_flow_catalog()
    meta = catalog.get(folder_slug, {})
    display_name = meta.get("displayName") or folder_slug

    raw = json.loads(definition_path.read_text(encoding="utf-8"))
    wrapped = wrap_definition(raw, folder_slug=folder_slug, display_name=display_name)
    if wrapped == raw:
        return False
    definition_path.write_text(json.dumps(wrapped, indent=2) + "\n", encoding="utf-8")
    return True
