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
DEPTH_VALUES: dict[str, int] = {
    "none":   0,
    "basic":  1,   # User (own records)
    "local":  2,   # Business Unit
    "deep":   3,   # Parent-Child Business Unit
    "global": 4,   # Organisation-wide
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
        resp.raise_for_status()
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

    def find_role(self, name: str) -> dict | None:
        data = self._get("roles", {
            "$filter": f"name eq '{name}'",
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
        # Fallback: re-query by name
        role = self.find_role(name)
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
        self._post("ReplacePrivilegesRole", {
            "RoleId": role_id,
            "Privileges": privileges,
        })


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
            depth = DEPTH_VALUES.get(depth_label, 0)
            if depth == 0:
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

    existing = client.find_role(name)
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
    client_id = os.environ.get("DATAVERSE_CLIENT_ID", "")
    client_secret = os.environ.get("DATAVERSE_CLIENT_SECRET", "")
    tenant_id = os.environ.get("DATAVERSE_TENANT_ID", "")

    missing_env = [
        name for name, val in [
            ("DATAVERSE_URL", url),
            ("DATAVERSE_CLIENT_ID", client_id),
            ("DATAVERSE_CLIENT_SECRET", client_secret),
            ("DATAVERSE_TENANT_ID", tenant_id),
        ]
        if not val
    ]
    if missing_env:
        print(
            f"ERROR: missing env vars: {', '.join(missing_env)}",
            file=sys.stderr,
        )
        return 1

    print("Authenticating...")
    token = _get_token(tenant_id, client_id, client_secret, url)

    client = DataverseClient(url, token)

    with open(SEED_FILE) as fh:
        config = yaml.safe_load(fh)

    bu_name: str = config["business_unit"]
    roles: list[dict] = config.get("roles", [])
    print(f"Loaded {len(roles)} role definition(s) from {SEED_FILE.name}")

    print(f"Ensuring Business Unit '{bu_name}'...")
    bu_id = client.ensure_business_unit(bu_name)
    print(f"  bu_id={bu_id}")

    print("Provisioning roles...")
    for role_def in roles:
        _provision_role(client, role_def, bu_id)

    print(f"\n{len(roles)} security role(s) provisioned successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
