"""Unit tests for dv_cli_common host gates (no live Dataverse)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

from dv_cli_common import (  # noqa: E402
    DEV_HOST,
    PROD_HOST,
    GateError,
    host_from_url,
    log_event,
    require_apply_confirm,
    require_dev_confirm,
)


def test_host_from_url_strips_scheme_and_path() -> None:
    assert host_from_url("https://nrg-enmax-dev.crm3.dynamics.com/") == DEV_HOST
    assert (
        host_from_url("https://nrg-enmax-dev.crm3.dynamics.com/api/data/v9.2")
        == DEV_HOST
    )
    assert host_from_url("nrg-enmax-dev.crm3.dynamics.com") == DEV_HOST
    assert host_from_url("HTTPS://NRG-ENMAX-DEV.CRM3.DYNAMICS.COM/foo") == DEV_HOST


def test_require_dev_confirm_ok() -> None:
    host = require_dev_confirm(
        f"https://{DEV_HOST}",
        confirm_dev=True,
        action="apply",
    )
    assert host == DEV_HOST


def test_require_dev_confirm_missing_flag_raises() -> None:
    with pytest.raises(GateError) as excinfo:
        require_dev_confirm(
            f"https://{DEV_HOST}",
            confirm_dev=False,
            action="apply",
        )
    assert "--confirm-dev" in excinfo.value.message
    assert "apply" in excinfo.value.message


def test_require_dev_confirm_wrong_host_raises() -> None:
    with pytest.raises(GateError) as excinfo:
        require_dev_confirm(
            "https://nrg-enmax.crm3.dynamics.com",
            confirm_dev=True,
            action="apply",
        )
    assert DEV_HOST in excinfo.value.message
    assert "nrg-enmax.crm3.dynamics.com" in excinfo.value.message


def test_require_apply_confirm_prod_ok() -> None:
    host = require_apply_confirm(
        f"https://{PROD_HOST}",
        confirm_dev=False,
        confirm_prod=True,
        action="apply",
    )
    assert host == PROD_HOST


def test_require_apply_confirm_prod_missing_flag() -> None:
    with pytest.raises(GateError) as excinfo:
        require_apply_confirm(
            f"https://{PROD_HOST}",
            confirm_dev=False,
            confirm_prod=False,
            action="apply",
        )
    assert "--confirm-prod" in excinfo.value.message


def test_require_apply_confirm_dev_still_works() -> None:
    host = require_apply_confirm(
        f"https://{DEV_HOST}",
        confirm_dev=True,
        confirm_prod=False,
        action="apply",
    )
    assert host == DEV_HOST


def test_gate_error_has_message_attr() -> None:
    err = GateError("ERROR: boom")
    assert err.message == "ERROR: boom"
    assert str(err) == "ERROR: boom"


def test_log_event_json_when_enabled(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setenv("ENMAX_OPS_LOG", "json")
    log_event("phase_start", phase="drawings", n=3)
    out = capsys.readouterr().out.strip()
    payload = json.loads(out)
    assert payload == {"event": "phase_start", "phase": "drawings", "n": 3}


def test_log_event_noop_when_unset(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.delenv("ENMAX_OPS_LOG", raising=False)
    log_event("phase_start", phase="drawings")
    assert capsys.readouterr().out == ""
