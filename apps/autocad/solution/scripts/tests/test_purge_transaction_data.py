"""Unit tests for purge_transaction_data helpers (no live Dataverse)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

from dv_cli_common import GateError  # noqa: E402
from purge_transaction_data import (  # noqa: E402
    DEV_HOST,
    PROD_HOSTS,
    assert_purge_allowed,
    build_bulk_delete_body,
    host_from_url,
)


def test_host_from_url_strips_scheme_and_path() -> None:
    assert host_from_url("https://nrg-enmax-dev.crm3.dynamics.com/") == DEV_HOST
    assert (
        host_from_url("https://nrg-enmax-dev.crm3.dynamics.com/api/data/v9.2")
        == DEV_HOST
    )
    assert host_from_url("nrg-enmax-dev.crm3.dynamics.com") == DEV_HOST
    assert host_from_url("HTTPS://NRG-ENMAX-DEV.CRM3.DYNAMICS.COM/foo") == DEV_HOST


def test_assert_purge_allowed_dev_with_confirm() -> None:
    host, sandbox = assert_purge_allowed(
        f"https://{DEV_HOST}",
        dry_run=False,
        confirm_dev=True,
        confirm_prod_emergency=False,
        job_name=None,
        sandbox=False,
    )
    assert host == DEV_HOST
    assert sandbox is False


def test_assert_purge_allowed_dev_sandbox_opt_in() -> None:
    host, sandbox = assert_purge_allowed(
        f"https://{DEV_HOST}",
        dry_run=False,
        confirm_dev=True,
        confirm_prod_emergency=False,
        job_name=None,
        sandbox=True,
    )
    assert host == DEV_HOST
    assert sandbox is True


def test_assert_purge_allowed_dev_dry_run_without_confirm() -> None:
    host, sandbox = assert_purge_allowed(
        f"https://{DEV_HOST}",
        dry_run=True,
        confirm_dev=False,
        confirm_prod_emergency=False,
        job_name=None,
        sandbox=False,
    )
    assert host == DEV_HOST
    assert sandbox is False


def test_assert_purge_allowed_dev_without_confirm_exits() -> None:
    with pytest.raises(GateError) as excinfo:
        assert_purge_allowed(
            f"https://{DEV_HOST}",
            dry_run=False,
            confirm_dev=False,
            confirm_prod_emergency=False,
            job_name=None,
            sandbox=False,
        )
    assert "--confirm-dev" in excinfo.value.message


def test_assert_purge_allowed_unknown_host_exits() -> None:
    with pytest.raises(GateError) as excinfo:
        assert_purge_allowed(
            "https://unknown.example.com",
            dry_run=False,
            confirm_dev=True,
            confirm_prod_emergency=False,
            job_name=None,
            sandbox=False,
        )
    assert "unknown.example.com" in excinfo.value.message


def test_assert_purge_allowed_prod_emergency() -> None:
    prod = next(iter(PROD_HOSTS))
    host, sandbox = assert_purge_allowed(
        f"https://{prod}",
        dry_run=False,
        confirm_dev=False,
        confirm_prod_emergency=True,
        job_name="emergency-purge",
        sandbox=False,
    )
    assert host == prod
    assert sandbox is False


def test_assert_purge_allowed_prod_sandbox_exits() -> None:
    prod = next(iter(PROD_HOSTS))
    with pytest.raises(GateError) as excinfo:
        assert_purge_allowed(
            f"https://{prod}",
            dry_run=False,
            confirm_dev=False,
            confirm_prod_emergency=True,
            job_name="emergency-purge",
            sandbox=True,
        )
    assert "sandbox" in excinfo.value.message.lower()


def test_assert_purge_allowed_prod_missing_confirm_exits() -> None:
    prod = next(iter(PROD_HOSTS))
    with pytest.raises(GateError) as excinfo:
        assert_purge_allowed(
            f"https://{prod}",
            dry_run=False,
            confirm_dev=False,
            confirm_prod_emergency=False,
            job_name="emergency-purge",
            sandbox=False,
        )
    assert "--confirm-prod-emergency" in excinfo.value.message


def test_assert_purge_allowed_prod_missing_job_name_exits() -> None:
    prod = next(iter(PROD_HOSTS))
    with pytest.raises(GateError) as excinfo:
        assert_purge_allowed(
            f"https://{prod}",
            dry_run=False,
            confirm_dev=False,
            confirm_prod_emergency=True,
            job_name=None,
            sandbox=False,
        )
    assert "--job-name" in excinfo.value.message


def test_build_bulk_delete_body_sandbox() -> None:
    body = build_bulk_delete_body("enmax_autocadcheckout", "test-job", sandbox=True)
    qs = body["QuerySet"][0]
    assert qs["EntityName"] == "enmax_autocadcheckout"
    assert qs["ColumnSet"] == {"AllColumns": False, "Columns": []}
    assert qs["Criteria"] == {
        "FilterOperator": "And",
        "Conditions": [],
        "Filters": [],
    }
    assert body["JobName"] == "test-job"
    assert body["SendEmailNotification"] is False
    assert body["ToRecipients"] == []
    assert body["CCRecipients"] == []
    assert body["RecurrencePattern"] == ""
    assert "StartDateTime" in body
    assert body["Options"]["RunJobForSandbox"] is True


def test_build_bulk_delete_body_no_sandbox() -> None:
    body = build_bulk_delete_body("enmax_autocadcheckout", "test-job", sandbox=False)
    assert "Options" not in body
