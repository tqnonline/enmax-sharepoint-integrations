#!/usr/bin/env python3
"""Load flow catalog and deploy helpers shared by deploy_flows.py."""

from __future__ import annotations

from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CATALOG_PATH = REPO_ROOT / "solution" / "flows" / "flow_catalog.yaml"
ADMIN_CATALOG_PATH = REPO_ROOT / "solution" / "flows" / "flow_catalog_admin.yaml"

FOLDER_TAG_PREFIX = "folderSlug:"

SOLUTION_PROD = "enmax_autocadsln"
SOLUTION_ADMIN = "enmax_autocadadminsln"


def _load_yaml(path: Path) -> dict[str, Any]:
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("PyYAML required: pip install pyyaml") from exc
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def load_flow_catalog() -> dict[str, dict[str, str]]:
    data = _load_yaml(CATALOG_PATH)
    flows = data.get("flows") or {}
    return {slug: meta for slug, meta in flows.items() if isinstance(meta, dict)}


def load_admin_flow_catalog() -> dict[str, dict[str, str]]:
    data = _load_yaml(ADMIN_CATALOG_PATH)
    flows = data.get("flows") or {}
    return {slug: meta for slug, meta in flows.items() if isinstance(meta, dict)}


def load_catalog(which: str = "prod") -> dict[str, dict[str, str]]:
    """Load the prod or admin flow catalog. which: "prod" | "admin"."""
    if which == "admin":
        return load_admin_flow_catalog()
    if which == "prod":
        return load_flow_catalog()
    raise ValueError(f"Unknown catalog '{which}' (expected 'prod' or 'admin')")


def solution_for_slug(slug: str) -> str:
    """Return the solution unique name that owns this folder slug.

    Admin-catalog membership wins so a UAT flow is never targeted at prod.
    """
    if slug in load_admin_flow_catalog():
        return SOLUTION_ADMIN
    return SOLUTION_PROD


def flow_display_name(folder_slug: str, catalog: dict[str, dict[str, str]] | None = None) -> str:
    cat = catalog if catalog is not None else load_flow_catalog()
    return cat.get(folder_slug, {}).get("displayName") or folder_slug


def flow_description(folder_slug: str, catalog: dict[str, dict[str, str]] | None = None) -> str:
    cat = catalog if catalog is not None else load_flow_catalog()
    meta = cat.get(folder_slug, {})
    desc = meta.get("description") or f"Enmax AutoCAD solution flow ({folder_slug})"
    return f"{desc} [{FOLDER_TAG_PREFIX}{folder_slug}]"


def parse_folder_slug_from_description(description: str | None) -> str | None:
    if not description:
        return None
    marker = f"[{FOLDER_TAG_PREFIX}"
    if marker not in description:
        return None
    start = description.index(marker) + len(marker)
    end = description.index("]", start)
    slug = description[start:end].strip()
    return slug or None


DEFAULT_FLOW_RUN_URL_TEMPLATE = (
    "https://make.powerautomate.com/environments/{environmentId}/flows/{flowId}/runs/{runId}"
)


def load_flow_run_url_template() -> str:
    data = _load_yaml(REPO_ROOT / "solution" / "seed" / "app_config.yaml")
    for row in data.get("rows") or []:
        if isinstance(row, dict) and row.get("key") == "FlowRunUrlTemplate":
            return str(row.get("value") or DEFAULT_FLOW_RUN_URL_TEMPLATE)
    return DEFAULT_FLOW_RUN_URL_TEMPLATE
