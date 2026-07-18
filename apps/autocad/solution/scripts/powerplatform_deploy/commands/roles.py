"""Roles command: provision Dataverse security roles from seed/security_roles.yaml.

Ports the logic from solution/scripts/provision_roles.py into the pp-deploy
package so it shares the DataverseClient / config / logging core.  The old
standalone script is left untouched (additive-only refactor).

CRITICAL INVARIANTS (#14 production fixes — do not regress):
1. ReplacePrivilegesRole is a BOUND action. POST to:
     roles({role_id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole
   with body {"Privileges": [...]}.  RoleId is NOT a body param.
2. Depth values are the PrivilegeDepth enum NAME strings ("Basic", "Local",
   "Deep", "Global"), never integers.
3. Business Unit is find-or-create: find by name; if absent, locate root BU
   (parent eq null) and POST the child under it; then re-find.  Idempotent.
4. Missing privileges are COLLECTED and WARNED — never crash.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import yaml

from powerplatform_deploy import logging as pp_logging
from powerplatform_deploy.client import DataverseClient
from powerplatform_deploy.config import load_env

# ---------------------------------------------------------------------------
# Maps (authoritative — must match provision_roles.py exactly)
# ---------------------------------------------------------------------------

# YAML depth label → PrivilegeDepth enum NAME string (Web API uses names, not ints).
DEPTH_VALUES: dict[str, str] = {
    "basic":  "Basic",   # User (own records)
    "local":  "Local",   # Business Unit
    "deep":   "Deep",    # Parent-Child Business Unit
    "global": "Global",  # Organisation-wide
}

# YAML operation key → Dataverse privilege name prefix.
OP_PREFIXES: dict[str, str] = {
    "create":   "prvCreate",
    "read":     "prvRead",
    "write":    "prvWrite",
    "delete":   "prvDelete",
    "append":   "prvAppend",
    "appendto": "prvAppendTo",
    "assign":   "prvAssign",
    "share":    "prvShare",
}

# Default seed file path (relative to repo root).
_DEFAULT_SEED_FILE = Path("solution") / "seed" / "security_roles.yaml"


# ---------------------------------------------------------------------------
# Business Unit helpers
# ---------------------------------------------------------------------------

def find_business_unit(client: DataverseClient, name: str) -> str | None:
    """Return the businessunitid for *name*, or None if not found."""
    data = client._get("businessunits", {
        "$filter": f"name eq '{name}'",
        "$select": "businessunitid",
    })
    items = data.get("value", [])
    return items[0]["businessunitid"] if items else None


def find_root_business_unit(client: DataverseClient) -> str:
    """Return the businessunitid of the root BU (no parent)."""
    data = client._get("businessunits", {
        "$filter": "_parentbusinessunitid_value eq null",
        "$select": "businessunitid",
        "$top": "1",
    })
    items = data.get("value", [])
    if not items:
        raise RuntimeError("Root Business Unit not found — cannot create a child BU.")
    return items[0]["businessunitid"]


def ensure_business_unit(client: DataverseClient, name: str, logger: Any) -> str:
    """Find the named child BU, creating it under the root BU if absent (idempotent)."""
    existing = find_business_unit(client, name)
    if existing:
        return existing

    root_id = find_root_business_unit(client)
    logger.info("Business Unit '%s' not found — creating under root BU %s...", name, root_id)
    try:
        client._post("businessunits", {
            "name": name,
            "parentbusinessunitid@odata.bind": f"/businessunits({root_id})",
        })
    except RuntimeError as exc:
        # May already exist (concurrent run / unique-name conflict) — fall through to re-find.
        logger.warning("create returned %s; re-checking for the BU...", exc)

    created = find_business_unit(client, name)
    if not created:
        raise RuntimeError(f"Business Unit '{name}' could not be found or created.")
    return created


# ---------------------------------------------------------------------------
# App Configuration / team helpers
# ---------------------------------------------------------------------------

def find_default_team(client: DataverseClient, bu_id: str) -> str | None:
    """Return the default owner team id for a business unit, or None."""
    data = client._get("teams", {
        "$filter": f"_businessunitid_value eq {bu_id} and isdefault eq true",
        "$select": "teamid",
        "$top": "1",
    })
    items = data.get("value", [])
    return items[0]["teamid"] if items else None


def find_team_by_name(client: DataverseClient, name: str) -> str | None:
    """Return teamid for a named team, or None."""
    data = client._get("teams", {
        "$filter": f"name eq '{name}'",
        "$select": "teamid",
        "$top": "1",
    })
    items = data.get("value", [])
    return items[0]["teamid"] if items else None


def get_app_config_value(client: DataverseClient, key: str) -> str | None:
    """Return the value for an App Configuration key, or None."""
    data = client._get("enmax_autocadappconfigs", {
        "$filter": f"enmax_acdnkey eq '{key}'",
        "$select": "enmax_acdnvalue",
        "$top": "1",
    })
    items = data.get("value", [])
    if not items:
        return None
    return items[0].get("enmax_acdnvalue")


def sync_team_app_config(client: DataverseClient, logger: Any) -> None:
    """Write AdminTeamId / ApproverTeamId from the seeded team name keys."""
    pairs = [
        ("AdminTeamId", "AdminTeamName"),
        ("ApproverTeamId", "ApproverTeamName"),
    ]
    for id_key, name_key in pairs:
        team_name = get_app_config_value(client, name_key)
        if not team_name:
            logger.warning("  App config key '%s' missing — cannot resolve %s", name_key, id_key)
            continue
        team_id = find_team_by_name(client, team_name)
        if not team_id:
            logger.warning("  Team '%s' not found — %s not set", team_name, id_key)
            continue
        upsert_app_config(client, id_key, team_id)
        logger.info("  %s -> %s (team '%s')", id_key, team_id, team_name)


def upsert_app_config(client: DataverseClient, key: str, value: str) -> None:
    """Idempotently set an App Configuration key=value (find by key, patch or create).

    If duplicate rows share the same key (historical seed+roles race), keep the
    first row, patch its value, and delete the extras so AppConfigReader's
    TopCount=1 cannot return a stale Guid.Empty placeholder.
    """
    data = client._get("enmax_autocadappconfigs", {
        "$filter": f"enmax_acdnkey eq '{key}'",
        "$select": "enmax_autocadappconfigid,enmax_acdnvalue",
        "$orderby": "createdon asc",
    })
    items = data.get("value", [])
    if not items:
        client._post("enmax_autocadappconfigs", {"enmax_acdnkey": key, "enmax_acdnvalue": value})
        return

    # Prefer a row that already has a non-empty, non-nil GUID when keeping one.
    empty = {"", "00000000-0000-0000-0000-000000000000"}
    keeper = next(
        (r for r in items if (r.get("enmax_acdnvalue") or "").strip().lower() not in empty),
        items[0],
    )
    keeper_id = keeper["enmax_autocadappconfigid"]
    client._patch(f"enmax_autocadappconfigs({keeper_id})", {"enmax_acdnvalue": value})
    for row in items:
        row_id = row["enmax_autocadappconfigid"]
        if row_id == keeper_id:
            continue
        client._delete(f"enmax_autocadappconfigs({row_id})")


# ---------------------------------------------------------------------------
# Security role helpers
# ---------------------------------------------------------------------------

def find_role(client: DataverseClient, name: str, bu_id: str | None = None) -> dict | None:
    """Return the role record dict {roleid, name} or None.

    When bu_id is given, scope to that BU — role names repeat across BUs (a
    root-BU role plus its auto-created child-BU copies), so idempotent re-runs
    must target one BU's role rather than matching the first of several.
    """
    flt = f"name eq '{name}'"
    if bu_id:
        flt += f" and _businessunitid_value eq {bu_id}"
    data = client._get("roles", {
        "$filter": flt,
        "$select": "roleid,name",
    })
    items = data.get("value", [])
    return items[0] if items else None


def create_role(client: DataverseClient, name: str, description: str, bu_id: str) -> str:
    """Create a security role and return its roleid."""
    resp = client._post("roles", {
        "name": name,
        "description": description,
        "businessunitid@odata.bind": f"/businessunits({bu_id})",
    })
    entity_url = resp.headers.get("OData-EntityId", "")
    if "(" in entity_url:
        return entity_url.split("(")[-1].rstrip(")")
    # Fallback: re-query by name within the same BU
    role = find_role(client, name, bu_id)
    if not role:
        raise RuntimeError(f"Created role '{name}' but could not retrieve it.")
    return role["roleid"]


# ---------------------------------------------------------------------------
# Privilege resolution
# ---------------------------------------------------------------------------

_priv_cache: dict[str, str | None] = {}


def _find_privilege_id(client: DataverseClient, priv_name: str) -> str | None:
    """Look up a privilege id by name; cache to avoid repeated GETs."""
    if priv_name in _priv_cache:
        return _priv_cache[priv_name]
    data = client._get("privileges", {
        "$filter": f"name eq '{priv_name}'",
        "$select": "privilegeid",
    })
    items = data.get("value", [])
    pid = items[0]["privilegeid"] if items else None
    _priv_cache[priv_name] = pid
    return pid


def _resolve_privileges(
    client: DataverseClient,
    entity_map: dict[str, dict[str, str]],
) -> tuple[list[dict], list[str]]:
    """Convert YAML privilege declarations into Dataverse privilege objects.

    Returns (resolved_list, missing_names).
    Depth label "none" or anything unrecognised means skip (no row emitted).
    """
    resolved: list[dict] = []
    missing: list[str] = []

    for entity_name, ops in entity_map.items():
        for op_key, depth_label in ops.items():
            depth = DEPTH_VALUES.get(depth_label)
            if depth is None:
                # "none" / unrecognised — no privilege row emitted
                continue

            prefix = OP_PREFIXES.get(op_key)
            if prefix is None:
                raise ValueError(
                    f"Unknown operation '{op_key}' in security_roles.yaml "
                    f"(entity: {entity_name})"
                )

            priv_name = f"{prefix}{entity_name}"
            priv_id = _find_privilege_id(client, priv_name)

            if priv_id is None:
                missing.append(priv_name)
            else:
                resolved.append({"Depth": depth, "PrivilegeId": priv_id})

    return resolved, missing


# ---------------------------------------------------------------------------
# Bound ReplacePrivilegesRole action
# ---------------------------------------------------------------------------

def replace_privileges(client: DataverseClient, role_id: str, privileges: list[dict]) -> None:
    """POST ReplacePrivilegesRole as a bound action on the role entity.

    The path MUST be roles({role_id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole
    and RoleId must NOT be a body param — it is the bound record.
    """
    client._post(
        f"roles({role_id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole",
        {"Privileges": privileges},
    )


# ---------------------------------------------------------------------------
# Per-role provisioning
# ---------------------------------------------------------------------------

def _provision_role(
    client: DataverseClient,
    role_def: dict,
    bu_id: str,
    logger: Any,
) -> None:
    name = role_def["name"]
    description = role_def.get("description", "").strip()
    entity_map: dict[str, dict[str, str]] = role_def.get("privileges", {})

    logger.info("  [%s]", name)

    existing = find_role(client, name, bu_id)
    if existing:
        role_id = existing["roleid"]
        logger.info("    exists  -> roleid=%s", role_id)
    else:
        role_id = create_role(client, name, description, bu_id)
        logger.info("    created -> roleid=%s", role_id)

    privileges, missing = _resolve_privileges(client, entity_map)

    if missing:
        logger.warning(
            "    WARNING: %d privilege(s) not found (tables not yet imported?):",
            len(missing),
        )
        for m in missing:
            logger.warning("      - %s", m)

    logger.info("    setting %d privilege(s) via ReplacePrivilegesRole...", len(privileges))
    replace_privileges(client, role_id, privileges)
    logger.info("    done.")


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run(environment: str, dry_run: bool, verbose: bool) -> None:
    """Provision Dataverse security roles from the seed file.

    Loads the security_roles.yaml file path from deploy.profile.yaml
    (``security_roles_file`` key, relative to repo root), falling back to
    ``solution/seed/security_roles.yaml`` if the key is absent.  The
    ``business_unit`` key inside the YAML file itself is authoritative.

    On --dry-run, logs role names and BU from YAML without any network calls.

    Args:
        environment: Target environment name, e.g. "dev", "uat", "prod".
        dry_run: When True, log intended actions and return without network calls.
        verbose: When True, emit DEBUG-level log output.
    """
    logger = pp_logging.get_logger(__name__, verbose)
    cfg = load_env(environment)

    repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent

    # Resolve the seed file path.  Profile key wins; fall back to default.
    try:
        from powerplatform_deploy.config import load_profile
        profile = load_profile(repo_root)
        seed_rel = profile.get("security_roles_file")
    except FileNotFoundError:
        seed_rel = None

    if seed_rel:
        seed_path = repo_root / seed_rel
    else:
        seed_path = repo_root / _DEFAULT_SEED_FILE

    logger.debug("Loading roles from: %s", seed_path)

    with seed_path.open(encoding="utf-8") as fh:
        config = yaml.safe_load(fh)

    bu_name: str = config["business_unit"]
    roles: list[dict] = config.get("roles", [])

    logger.info(
        "Loaded %d role definition(s) from %s",
        len(roles),
        seed_path.name,
    )
    logger.info("Business Unit: %s", bu_name)

    if dry_run:
        logger.info("[dry-run] Would provision %d role(s) in BU '%s':", len(roles), bu_name)
        for role_def in roles:
            logger.info("  - %s", role_def.get("name", "<unnamed>"))
        return

    client = DataverseClient.from_env(cfg)

    # Ensure the child BU exists (teams are scoped to it), but create the ROLES
    # in the ROOT BU so they are solution-eligible (only root-BU roles can be
    # added to a solution) and deploy to UAT/prod via pipeline/import. The root
    # BU is resolved dynamically, so this is correct in every environment.
    # Dataverse auto-creates a child-BU copy of each root-BU role for team use.
    logger.info("Ensuring Business Unit '%s'...", bu_name)
    ensure_business_unit(client, bu_name, logger)
    bu_id = find_root_business_unit(client)
    logger.info("  root bu_id=%s (roles created here — solution-eligible)", bu_id)

    logger.info("Provisioning roles in the root BU...")
    for role_def in roles:
        _provision_role(client, role_def, bu_id, logger)

    logger.info("%d security role(s) provisioned successfully.", len(roles))

    child_bu_id = find_business_unit(client, bu_name)
    team_id = find_default_team(client, child_bu_id) if child_bu_id else None
    if team_id:
        upsert_app_config(client, "AppOwnerTeamId", team_id)
        logger.info("  AppOwnerTeamId -> %s (default team of %s)", team_id, bu_name)
    else:
        logger.warning("  No default team found for BU '%s' — AppOwnerTeamId not set", bu_name)

    logger.info("Syncing Admin/Approver team ids into App Configuration...")
    sync_team_app_config(client, logger)
