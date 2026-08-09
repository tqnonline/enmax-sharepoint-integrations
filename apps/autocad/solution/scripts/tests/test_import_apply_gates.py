"""Unit tests for import apply host gates."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

from dv_cli_common import DEV_HOST, GateError, require_dev_confirm  # noqa: E402


def test_require_dev_confirm_ok() -> None:
    host = require_dev_confirm(f"https://{DEV_HOST}", confirm_dev=True, action="import apply")
    assert host == DEV_HOST


def test_require_dev_confirm_missing_flag() -> None:
    with pytest.raises(GateError, match="confirm-dev"):
        require_dev_confirm(f"https://{DEV_HOST}", confirm_dev=False, action="import apply")


def test_require_dev_confirm_rejects_other_host() -> None:
    with pytest.raises(GateError):
        require_dev_confirm(
            "https://nrg-enmax.crm3.dynamics.com",
            confirm_dev=True,
            action="import apply",
        )
