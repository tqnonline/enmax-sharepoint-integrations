"""Provision Dataverse security roles from seed/security_roles.yaml.

Run order: after solution import (tables must exist), after seed.py.
Idempotent — safe to re-run. Existing roles are updated in-place;
existing privileges are fully replaced with whatever the YAML specifies.

Required env vars (same as import.py / seed.py):
  DATAVERSE_URL           – https://<org>.crm3.dynamics.com
  DATAVERSE_CLIENT_ID     – service-principal application (client) ID
  DATAVERSE_CLIENT_SECRET – service-principal client secret
  DATAVERSE_TENANT_ID     – Azure AD tenant ID
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import msal
import requests
import yaml

SEED_FILE = Path(__file__).parent.parent / "seed" / "security_roles.yaml"

# Maps YAML depth labels to the integer values Dataverse expects.
# Dataverse PrivilegeDepth enum. The Web API serialises enums as the member NAME
# (a quoted string), not the numeric value. "none" is omitted — absence means
# "no privilege" and the row is skipped.
DEPTH_VALUES: dict[str, str] = {
    "basic":  "Basic",   # User (own records)
    "local":  "Local",   # Business Unit
    "deep":   "Deep",    # Parent-Child Business Unit
    "global": "Global",  # Organisation-wide
}

# Maps YAML operation keys to Dataverse privilege name prefixes.
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


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def _get_token(tenant_id: str, client_id: str, client_secret: str, resource: str) -> str:
    app = msal.ConfidentialClientApplication(
        client_id,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
        client_credential=client_secret,
    )
    result = app.acquire_token_for_client(scopes=[f"{resource}/.default"])
    if "access_token" not in result:
        raise RuntimeError(
            f"Auth failed: {result.get('error_description', result)}"
        )
    return result["access_token"]


# ---------------------------------------------------------------------------
# Dataverse client
# ---------------------------------------------------------------------------

class DataverseClient:
    def __init__(self, base_url: str, token: str) -> None:
        self._base = base_url.rstrip("/") + "/api/data/v9.2"
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {token}",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })
        self._priv_cache: dict[str, str] = {}

    def _get(self, path: str, params: dict[str, str] | None = None) -> Any:
        resp = self._session.get(f"{self._base}/{path}", params=params)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict) -> requests.Response:
        resp = self._session.post(f"{self._base}/{path}", json=body)
        if not resp.ok:
            # Surface the Dataverse error body (fail-loud) — raise_for_status hides it.
            raise RuntimeError(f"POST {path} -> {resp.status_code}: {resp.text}")
        return resp

    def _patch(self, path: str, body: dict) -> requests.Response:
        resp = self._session.patch(f"{self._base}/{path}", json=body)
        if not resp.ok:
            raise RuntimeError(f"PATCH {path} -> {resp.status_code}: {resp.text}")
        return resp

    def _delete(self, path: str) -> requests.Response:
        resp = self._session.delete(f"{self._base}/{path}")
        if not resp.ok:
            raise RuntimeError(f"DELETE {path} -> {resp.status_code}: {resp.text}")
        return resp

    # ------------------------------------------------------------------
    # Business Unit
    # ------------------------------------------------------------------

    def find_business_unit(self, name: str) -> str | None:
        data = self._get("businessunits", {
            "$filter": f"name eq '{name}'",
            "$select": "businessunitid",
        })
        items = data.get("value", [])
        return items[0]["businessunitid"] if items else None

    def find_root_business_unit(self) -> str:
        data = self._get("businessunits", {
            "$filter": "_parentbusinessunitid_value eq null",
            "$select": "businessunitid",
            "$top": "1",
        })
        items = data.get("value", [])
        if not items:
            raise RuntimeError("Root Business Unit not found — cannot create a child BU.")
        return items[0]["businessunitid"]

    def ensure_business_unit(self, name: str) -> str:
        """Find the named child BU, creating it under the root BU if absent (idempotent)."""
        existing = self.find_business_unit(name)
        if existing:
            return existing
        root_id = self.find_root_business_unit()
        print(f"  Business Unit '{name}' not found — creating under root BU {root_id}...")
        try:
            self._post("businessunits", {
                "name": name,
                "parentbusinessunitid@odata.bind": f"/businessunits({root_id})",
            })
        except requests.HTTPError as exc:
            # May already exist (concurrent run / unique-name conflict) — fall through to re-find.
            print(f"  create returned {exc}; re-checking for the BU...")
        created = self.find_business_unit(name)
        if not created:
            raise RuntimeError(f"Business Unit '{name}' could not be found or created.")
        return created

    # ------------------------------------------------------------------
    # Security roles
    # ------------------------------------------------------------------

    def find_role(self, name: str, bu_id: str | None = None) -> dict | None:
        flt = f"name eq '{name}'"
        if bu_id:
            # Role names repeat across BUs (root + auto-created child copies);
            # scope the lookup so idempotency targets the intended BU's role.
            flt += f" and _businessunitid_value eq {bu_id}"
        data = self._get("roles", {
            "$filter": flt,
            "$select": "roleid,name",
        })
        items = data.get("value", [])
        return items[0] if items else None

    def create_role(self, name: str, description: str, bu_id: str) -> str:
        resp = self._post("roles", {
            "name": name,
            "description": description,
            "businessunitid@odata.bind": f"/businessunits({bu_id})",
        })
        # Dataverse returns 204 with OData-EntityId header: .../roles(<guid>)
        entity_url = resp.headers.get("OData-EntityId", "")
        if "(" in entity_url:
            return entity_url.split("(")[-1].rstrip(")")
        # Fallback: re-query by name within the same BU
        role = self.find_role(name, bu_id)
        if not role:
            raise RuntimeError(f"Created role '{name}' but could not retrieve it.")
        return role["roleid"]

    # ------------------------------------------------------------------
    # Privileges
    # ------------------------------------------------------------------

    def _find_privilege_id(self, priv_name: str) -> str | None:
        if priv_name in self._priv_cache:
            return self._priv_cache[priv_name]
        data = self._get("privileges", {
            "$filter": f"name eq '{priv_name}'",
            "$select": "privilegeid",
        })
        items = data.get("value", [])
        if items:
            pid = items[0]["privilegeid"]
            self._priv_cache[priv_name] = pid
            return pid
        return None

    def replace_privileges(self, role_id: str, privileges: list[dict]) -> None:
        # ReplacePrivilegesRole is an action BOUND to the role entity — call it on
        # the role instance (RoleId is the bound record, not a body param).
        self._post(
            f"roles({role_id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole",
            {"Privileges": privileges},
        )


# ---------------------------------------------------------------------------
# Privilege resolution
# ---------------------------------------------------------------------------

def _resolve_privileges(
    client: DataverseClient,
    entity_map: dict[str, dict[str, str]],
) -> tuple[list[dict], list[str]]:
    """
    Convert YAML privilege declarations into Dataverse privilege objects.
    Returns (resolved_list, missing_names).
    """
    resolved: list[dict] = []
    missing: list[str] = []

    for entity_name, ops in entity_map.items():
        for op_key, depth_label in ops.items():
            depth = DEPTH_VALUES.get(depth_label)
            if depth is None:   # "none" / unrecognised → no privilege (Basic is a valid 0)
                continue

            prefix = OP_PREFIXES.get(op_key)
            if prefix is None:
                raise ValueError(
                    f"Unknown operation '{op_key}' in security_roles.yaml "
                    f"(entity: {entity_name})"
                )

            priv_name = f"{prefix}{entity_name}"
            priv_id = client._find_privilege_id(priv_name)

            if priv_id is None:
                missing.append(priv_name)
            else:
                resolved.append({"Depth": depth, "PrivilegeId": priv_id})

    return resolved, missing


# ---------------------------------------------------------------------------
# Per-role provisioning
# ---------------------------------------------------------------------------

def _provision_role(
    client: DataverseClient,
    role_def: dict,
    bu_id: str,
) -> None:
    name = role_def["name"]
    description = role_def.get("description", "").strip()
    entity_map: dict[str, dict[str, str]] = role_def.get("privileges", {})

    print(f"  [{name}]")

    existing = client.find_role(name, bu_id)
    if existing:
        role_id = existing["roleid"]
        print(f"    exists  → roleid={role_id}")
    else:
        role_id = client.create_role(name, description, bu_id)
        print(f"    created → roleid={role_id}")

    privileges, missing = _resolve_privileges(client, entity_map)

    if missing:
        print(f"    WARNING: {len(missing)} privilege(s) not found "
              f"(tables not yet imported?):")
        for m in missing:
            print(f"      - {m}")

    print(f"    setting {len(privileges)} privilege(s) via ReplacePrivilegesRole...")
    client.replace_privileges(role_id, privileges)
    print(f"    done.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    # The script prints non-ASCII (e.g. "->") and runs on Windows CI where stdout
    # defaults to cp1252 — force UTF-8 so a status print can't crash the deploy.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    url = os.environ.get("DATAVERSE_URL", "").rstrip("/")
    if not url:
        print("ERROR: missing env var: DATAVERSE_URL", file=sys.stderr)
        return 1

    # Auth resolution (mirrors seed.py): a bring-your-own bearer token
    # (DATAVERSE_ACCESS_TOKEN — e.g. `az account get-access-token` or pac) wins and
    # needs no service principal. This is how a no-SP environment behind Conditional
    # Access (e.g. UAT) is provisioned with a sysadmin user login. Otherwise fall
    # back to MSAL client credentials.
    byo = os.environ.get("DATAVERSE_ACCESS_TOKEN", "").strip()
    if byo:
        print("Using DATAVERSE_ACCESS_TOKEN from environment.", file=sys.stderr)
        token = byo
    else:
        client_id = os.environ.get("DATAVERSE_CLIENT_ID", "")
        client_secret = os.environ.get("DATAVERSE_CLIENT_SECRET", "")
        tenant_id = os.environ.get("DATAVERSE_TENANT_ID", "")
        missing_env = [
            name for name, val in [
                ("DATAVERSE_CLIENT_ID", client_id),
                ("DATAVERSE_CLIENT_SECRET", client_secret),
                ("DATAVERSE_TENANT_ID", tenant_id),
            ]
            if not val
        ]
        if missing_env:
            print(
                f"ERROR: missing env vars: {', '.join(missing_env)} "
                "(or set DATAVERSE_ACCESS_TOKEN to bypass the service principal)",
                file=sys.stderr,
            )
            return 1
        print("Authenticating (service principal)...")
        token = _get_token(tenant_id, client_id, client_secret, url)

    client = DataverseClient(url, token)

    with open(SEED_FILE) as fh:
        config = yaml.safe_load(fh)

    bu_name: str = config["business_unit"]
    roles: list[dict] = config.get("roles", [])
    print(f"Loaded {len(roles)} role definition(s) from {SEED_FILE.name}")

    # Ensure the child BU exists (teams are scoped to it), but create the ROLES
    # in the ROOT BU so they are solution-eligible (only root-BU roles can be
    # added to a solution) and therefore deploy to UAT/prod via pipeline/import.
    # The root BU is resolved dynamically, so this is correct in every env.
    # NOTE: creating a role in the root BU makes Dataverse auto-create a copy in
    # each child BU — assign the child-BU team to that child copy.
    print(f"Ensuring Business Unit '{bu_name}'...")
    client.ensure_business_unit(bu_name)
    bu_id = client.find_root_business_unit()
    print(f"  root bu_id={bu_id} (roles created here — solution-eligible)")

    print("Provisioning roles in the root BU...")
    for role_def in roles:
        _provision_role(client, role_def, bu_id)

    print(f"\n{len(roles)} security role(s) provisioned successfully.")

    # BU default team must hold the infra ownership role so SetAppOwner creates
    # (audit/config/ref) pass Dataverse's owner Read check. Humans stay on
    # User / Approver / Admin only.
    from powerplatform_deploy.commands.roles import (  # noqa: PLC0415
        ensure_app_owner_role_on_default_team,
        find_default_team,
        upsert_app_config,
    )

    child_bu_id = client.find_business_unit(bu_name)
    team_id = find_default_team(client, child_bu_id) if child_bu_id else None
    if team_id and child_bu_id:
        upsert_app_config(client, "AppOwnerTeamId", team_id)
        print(f"  AppOwnerTeamId -> {team_id} (default team of {bu_name})")
        print("Assigning infra ownership role to BU default team...")

        class _PrintLogger:
            def info(self, msg, *args):
                print(msg % args if args else msg)
            def warning(self, msg, *args):
                print("WARNING:", msg % args if args else msg)

        ensure_app_owner_role_on_default_team(client, child_bu_id, team_id, _PrintLogger())
    else:
        print(f"  WARNING: No default team for BU '{bu_name}' — AppOwnerTeamId / ownership role skipped")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
