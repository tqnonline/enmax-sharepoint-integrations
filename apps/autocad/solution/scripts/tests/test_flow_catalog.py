"""Tests for flow_catalog.py."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

import flow_catalog as fc  # noqa: E402


def test_catalog_has_twelve_flows() -> None:
    catalog = fc.load_flow_catalog()
    # WS5 indexer split into Full + Incremental (was a single Sweep flow) — net +1.
    assert len(catalog) == 12
    assert "Child_Log_Flow_Exception" in catalog
    assert "Manual_Refresh_SharePoint_Index" in catalog
    assert "Scheduled_SharePoint_Indexer_Full" in catalog
    assert "Scheduled_SharePoint_Indexer_Incremental" in catalog


def test_prod_catalog_excludes_uat_flows() -> None:
    catalog = fc.load_flow_catalog()
    assert "UAT_Seed_SharePoint_Test_PDFs" not in catalog
    assert "UAT_Teardown_SharePoint_Test_PDFs" not in catalog
    assert "UAT_Validate_SharePoint_Index" not in catalog


def test_admin_catalog_has_three_uat_flows() -> None:
    catalog = fc.load_admin_flow_catalog()
    assert len(catalog) == 3
    assert set(catalog) == {
        "UAT_Seed_SharePoint_Test_PDFs",
        "UAT_Teardown_SharePoint_Test_PDFs",
        "UAT_Validate_SharePoint_Index",
    }


def test_load_catalog_dispatches_prod_and_admin() -> None:
    assert fc.load_catalog("prod") == fc.load_flow_catalog()
    assert fc.load_catalog("admin") == fc.load_admin_flow_catalog()
    assert fc.load_catalog() == fc.load_flow_catalog()


def test_load_catalog_rejects_unknown_which() -> None:
    import pytest

    with pytest.raises(ValueError):
        fc.load_catalog("staging")


def test_solution_for_slug_routes_uat_flows_to_admin() -> None:
    assert fc.solution_for_slug("UAT_Seed_SharePoint_Test_PDFs") == fc.SOLUTION_ADMIN
    assert fc.solution_for_slug("Manual_Refresh_SharePoint_Index") == fc.SOLUTION_PROD


def test_display_name_format() -> None:
    name = fc.flow_display_name("On_Checkout_Created_Email_Notifications")
    assert name.startswith("Enmax AutoCAD | On Create of Checkout |")


def test_description_includes_folder_slug_tag() -> None:
    desc = fc.flow_description("Child_Send_System_Email")
    assert "[folderSlug:Child_Send_System_Email]" in desc


def test_parse_folder_slug_from_description() -> None:
    desc = "Internal child flow [folderSlug:Child_Log_Flow_Exception]"
    assert fc.parse_folder_slug_from_description(desc) == "Child_Log_Flow_Exception"
