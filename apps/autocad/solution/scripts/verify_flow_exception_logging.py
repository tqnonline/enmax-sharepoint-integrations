#!/usr/bin/env python3
"""Force a flow failure via HTTP trigger and verify enmax_autocadflowexception row is created."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "solution" / "scripts"))

from flow_catalog import flow_display_name, load_catalog  # noqa: E402
from seed import acquire_token  # noqa: E402

BASE = os.environ.get("DATAVERSE_URL", "https://nrg-enmax-dev.crm3.dynamics.com").rstrip("/")
ENV_ID = os.environ.get("ENVIRONMENT_ID", "21763ca5-959a-e114-9ce5-f67c2a0dbef0")
TARGET_SLUG = os.environ.get("VERIFY_FLOW_SLUG", "UAT_Teardown_SharePoint_Test_PDFs")
TARGET_TRIGGER = os.environ.get("VERIFY_FLOW_TRIGGER", "Manual_Teardown")
FLOW_RESOURCE = "https://service.flow.microsoft.com/"


def _resolve_display_name(slug: str) -> str:
    """Resolve maker display name from prod or admin catalog."""
    for which in ("admin", "prod"):
        cat = load_catalog(which)
        if slug in cat:
            return flow_display_name(slug, cat)
    return flow_display_name(slug)


def _flow_token() -> str:
    try:
        out = subprocess.check_output(
            ["az", "account", "get-access-token", "--resource", FLOW_RESOURCE, "-o", "tsv", "--query", "accessToken"],
            text=True,
        )
        token = out.strip()
        if token:
            return token
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    raise RuntimeError("Could not acquire Flow API token via az account get-access-token")


def _find_workflow_id(session: requests.Session, token: str, display_name: str) -> str:
    safe = display_name.replace("'", "''")
    filt = quote(f"name eq '{safe}' and category eq 5", safe="")
    url = f"{BASE}/api/data/v9.2/workflows?$select=workflowid,name&$filter={filt}&$top=1"
    resp = session.get(
        url,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=60,
    )
    resp.raise_for_status()
    rows = resp.json().get("value", [])
    if not rows:
        raise RuntimeError(f"Workflow not found: {display_name}")
    return rows[0]["workflowid"]


def _trigger_callback_url(flow_token: str, workflow_id: str, trigger_name: str) -> str:
    url = (
        f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple"
        f"/environments/{ENV_ID}/flows/{workflow_id}/triggers/{trigger_name}/listCallbackUrl"
        f"?api-version=2016-11-01"
    )
    resp = requests.post(url, headers={"Authorization": f"Bearer {flow_token}"}, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    callback = data.get("value") or data.get("response", {}).get("value")
    if not callback:
        raise RuntimeError(f"No callback URL in response: {json.dumps(data)[:300]}")
    return callback


def _run_http_trigger(callback_url: str, body: dict) -> None:
    resp = requests.post(callback_url, json=body, timeout=180)
    print(f"  Trigger HTTP {resp.status_code}")
    if resp.text:
        print(f"  Body: {resp.text[:400]}")


def _latest_exceptions(session: requests.Session, token: str, *, top: int = 5) -> list[dict]:
    url = (
        f"{BASE}/api/data/v9.2/enmax_autocadflowexceptions"
        f"?$select=enmax_acdnname,enmax_acdnorigin,enmax_acdnseverity,enmax_acdnerrormessage,"
        f"enmax_acdnfailedaction,enmax_acdnflowdisplayname,enmax_acdnflowrunid,enmax_acdnflowrunurl,"
        f"enmax_acdncorrelationid,createdon"
        f"&$orderby=createdon desc&$top={top}"
    )
    resp = session.get(
        url,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json().get("value", [])


def main() -> int:
    display = _resolve_display_name(TARGET_SLUG)
    print(f"Target: {BASE}")
    print(f"Flow: {TARGET_SLUG} → {display} (trigger: {TARGET_TRIGGER})")

    dv_token = acquire_token(BASE, "azcli")
    session = requests.Session()

    before = _latest_exceptions(session, dv_token, top=3)
    before_ts = before[0].get("createdon", "") if before else ""
    print(f"Exception rows before: {len(before)}")

    workflow_id = _find_workflow_id(session, dv_token, display)
    print(f"Workflow id: {workflow_id}")

    flow_token = _flow_token()
    callback = _trigger_callback_url(flow_token, workflow_id, TARGET_TRIGGER)
    print("Invoking flow with invalid files JSON (forced failure)...")
    _run_http_trigger(callback, {"files": "{{not-valid-json"})

    print("Waiting for async logging...")
    found = None
    for attempt in range(18):
        time.sleep(5)
        rows = _latest_exceptions(session, dv_token, top=8)
        for row in rows:
            if row.get("enmax_acdnflowdisplayname") != display:
                continue
            created = row.get("createdon", "")
            if before_ts and created <= before_ts:
                continue
            found = row
            break
        if found:
            print(f"  Found row after {(attempt + 1) * 5}s")
            break

    if not found:
        print("ERROR: No new enmax_autocadflowexception row detected.", file=sys.stderr)
        print("Latest rows:", file=sys.stderr)
        for row in _latest_exceptions(session, dv_token, top=3):
            print(json.dumps(row, indent=2), file=sys.stderr)
        return 1

    print("\nVerified exception row:")
    print(json.dumps(found, indent=2))

    origin = found.get("enmax_acdnorigin")
    if origin != 1:
        print(f"WARN: expected origin Flow (1), got {origin}", file=sys.stderr)
    if not found.get("enmax_acdnflowrunurl"):
        print("WARN: flowrunurl is empty", file=sys.stderr)
    if not found.get("enmax_acdnfailedaction"):
        print("WARN: failedaction is empty", file=sys.stderr)

    print("\nPASS: Flow failure logged to enmax_autocadflowexception.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
