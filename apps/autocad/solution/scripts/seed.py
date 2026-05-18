"""Deterministic-GUID seed loader for Dataverse master data.

Reads every YAML file in solution/seed/, computes deterministic GUIDs, and upserts
rows to Dataverse via the Web API using MSAL client-credentials auth.

Usage:
    python solution/scripts/seed.py [--dry-run] [--table <logical_name>]

Env vars (or .env.local at repo root):
    DATAVERSE_URL           https://<org>.crm.dynamics.com
    DATAVERSE_CLIENT_ID     service principal app id
    DATAVERSE_CLIENT_SECRET service principal secret
    DATAVERSE_TENANT_ID     AAD tenant id
    APP_CONFIG_SHARED_MAILBOX  override for SharedMailboxAddress (optional)
"""

import argparse
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import requests
import yaml

try:
    import msal
except ImportError:
    print("ERROR: msal not installed. Run: uv pip install msal", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SEED_DIR = REPO_ROOT / "solution" / "seed"

_ENV_ALIASES: dict[str, str] = {
    "ENVIRONMENT_URL": "DATAVERSE_URL",
    "CLIENT_ID":       "DATAVERSE_CLIENT_ID",
    "CLIENT_SECRET":   "DATAVERSE_CLIENT_SECRET",
    "TENANT_ID":       "DATAVERSE_TENANT_ID",
}

UUID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "enmax-autocad")

# Topological load order for reference tables (parents before children)
REFERENCE_LOAD_ORDER = [
    "business",
    "asset",
    "unit",
    "domain",
    "system",
    "kind",
    "record_type",
    "record_phase",
    "vendor",
    "approved_bb_aa",
    "asset_unit",
    "system_scope",
]

# Topological load order for sample/test data (parents before children)
SAMPLE_LOAD_ORDER = [
    "reservation",
    "drawing",
    "sheet",
    "checkout",
    "audit_event",
    "broadcast",
    "in_app_notification",
    "broadcast_dismissal",
    "user_preference",
]

OPTION_SET_VALUE_MAP: dict[str, dict[str, int]] = {}


# ---------------------------------------------------------------------------
# Deterministic GUID
# ---------------------------------------------------------------------------

def deterministic_id(table: str, natural_key: str) -> uuid.UUID:
    return uuid.uuid5(UUID_NAMESPACE, f"{table}|{natural_key}")


# ---------------------------------------------------------------------------
# Environment loading
# ---------------------------------------------------------------------------

def _main_repo_root() -> Path:
    p = REPO_ROOT
    while p != p.parent:
        if (p / ".worktrees").is_dir():
            return p
        p = p.parent
    return REPO_ROOT


def _load_env_local() -> None:
    env_local = _main_repo_root() / ".env.local"
    if not env_local.exists():
        return
    for line in env_local.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    for src, dst in _ENV_ALIASES.items():
        if src in os.environ and dst not in os.environ:
            os.environ[dst] = os.environ[src]


def _require_env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        print(f"ERROR: env var {name} is not set.", file=sys.stderr)
        sys.exit(1)
    return val


# ---------------------------------------------------------------------------
# MSAL token
# ---------------------------------------------------------------------------

def _get_token(client_id: str, client_secret: str, tenant_id: str, dataverse_url: str) -> str:
    scope = dataverse_url.rstrip("/") + "/.default"
    authority = f"https://login.microsoftonline.com/{tenant_id}"
    app = msal.ConfidentialClientApplication(
        client_id=client_id,
        client_credential=client_secret,
        authority=authority,
    )
    result = app.acquire_token_for_client(scopes=[scope])
    if "access_token" not in result:
        error = result.get("error_description", result.get("error", "unknown"))
        print(f"ERROR: MSAL token acquisition failed: {error}", file=sys.stderr)
        sys.exit(1)
    return result["access_token"]


# ---------------------------------------------------------------------------
# Template resolution ({{ VAR | default('...') }})
# ---------------------------------------------------------------------------

_TEMPLATE_RE = re.compile(r"\{\{\s*(\w+)\s*\|\s*default\(['\"](.+?)['\"]\)\s*\}\}")


def _resolve_template(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    def replacer(m: re.Match) -> str:
        env_key, default = m.group(1), m.group(2)
        return os.environ.get(env_key, default)
    return _TEMPLATE_RE.sub(replacer, value)


def _resolve_templates_in_row(row: dict) -> dict:
    return {k: _resolve_template(v) for k, v in row.items()}


# ---------------------------------------------------------------------------
# YAML loading
# ---------------------------------------------------------------------------

def _load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _load_option_sets() -> None:
    os_dir = SEED_DIR / "option_sets"
    if not os_dir.exists():
        return
    for f in sorted(os_dir.glob("*.yaml")):
        data = _load_yaml(f)
        table_name = data.get("schema_name", f.stem)
        values = data.get("values", [])
        OPTION_SET_VALUE_MAP[table_name] = {
            str(v["label"]): int(v["value"]) for v in values
        }
        # Fail fast: every option set must have a 0=None row
        if 0 not in OPTION_SET_VALUE_MAP[table_name].values():
            print(
                f"ERROR: Option set {table_name} is missing the 0=None row.",
                file=sys.stderr,
            )
            sys.exit(1)


# ---------------------------------------------------------------------------
# Natural key computation per table
# ---------------------------------------------------------------------------

def _natural_key(table: str, row: dict, loaded_rows: dict[str, dict]) -> str:
    """Compute the natural key string used for deterministic_id."""
    if table == "enmax_autocadasset":
        return row["code"]
    if table == "enmax_autocadunit":
        return row["code"]
    if table == "enmax_autocadbusinessasset":
        return f"{row['business_code']}|{row['asset_code']}"
    if table == "enmax_autocadassetunit":
        return f"{row['asset_code']}|{row['unit_code']}"
    if table == "enmax_autocadsystemscope":
        return f"{row['system_code']}|{row['scope_type']}|{row['scope_value']}"
    if table == "enmax_autocadappconfig":
        return row["key"]
    if table == "enmax_autocadnumbersequence":
        return row["sequence_key"]
    if table == "enmax_autocadreservation":
        return row["_nk"]
    if table == "enmax_autocaddrawing":
        return row.get("number", row.get("enmax_acdnnumber", ""))
    if table == "enmax_autocadsheet":
        return row.get("filename", row.get("enmax_acdnfilename", ""))
    if table == "enmax_autocadbroadcast":
        return row.get("title", "")
    if table == "enmax_autocadinappnotification":
        return row.get("title", "")
    # Default: use code / name
    nk_cols = ["code", "key", "name"]
    for col in nk_cols:
        if col in row:
            return str(row[col])
    raise ValueError(f"Cannot compute natural key for table {table}, row {row}")


# ---------------------------------------------------------------------------
# Lookup resolution
# ---------------------------------------------------------------------------

def _resolve_lookups(row: dict, lookups: dict, loaded_rows: dict[str, dict]) -> dict:
    """Replace lookup source columns with resolved Dataverse entity reference dicts."""
    resolved = dict(row)
    for lookup_name, spec in lookups.items():
        parent_table = spec["table"]
        source_col = spec["source_column"]
        key_val = row.get(source_col)
        if key_val is None:
            continue
        parent_nk = str(key_val)

        if parent_table == "systemuser":
            # GUIDs for system users are assigned by AAD; resolve from preloaded cache.
            parent_id = loaded_rows.get("systemuser", {}).get(parent_nk)
            entity_set = "systemusers"
        else:
            parent_id = str(deterministic_id(parent_table, parent_nk))
            entity_set = _entity_set_name(parent_table)

        dv_lookup = _LOOKUP_REMAP.get(lookup_name, lookup_name)
        del resolved[source_col]
        if parent_id:
            resolved[f"{dv_lookup}@odata.bind"] = f"/{entity_set}({parent_id})"
    return resolved


# ---------------------------------------------------------------------------
# Entity set name (pluralised logical name)
# ---------------------------------------------------------------------------

_ENTITY_SET_OVERRIDES: dict[str, str] = {}


def _entity_set_name(table: str) -> str:
    if table in _ENTITY_SET_OVERRIDES:
        return _ENTITY_SET_OVERRIDES[table]
    # Dataverse pluralises the logical name; handle common English suffix rules.
    # Exact plural is set in Maker UI table settings — update _ENTITY_SET_OVERRIDES
    # post-authoring if the generated name differs.
    if table.endswith(("s", "x", "z", "ch", "sh")):
        return table + "es"
    return table + "s"


# ---------------------------------------------------------------------------
# Option set value resolution
# ---------------------------------------------------------------------------

def _resolve_choice(column_schema: str, label: str) -> int:
    """Look up the integer code for a Choice column label."""
    for os_name, mapping in OPTION_SET_VALUE_MAP.items():
        if label in mapping:
            return mapping[label]
    raise ValueError(
        f"Choice label '{label}' not found in any loaded option set "
        f"(column: {column_schema}). Check option set YAML files."
    )


# ---------------------------------------------------------------------------
# Dataverse upsert
# ---------------------------------------------------------------------------

def _build_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _upsert_row(
    session: requests.Session,
    dataverse_url: str,
    token: str,
    table: str,
    row_id: uuid.UUID,
    payload: dict,
    dry_run: bool,
) -> bool:
    """PATCH upsert. Returns True if the call was made (or would be made in dry-run)."""
    entity_set = _entity_set_name(table)
    url = f"{dataverse_url.rstrip('/')}/api/data/v9.2/{entity_set}({row_id})"
    if dry_run:
        print(f"  [DRY-RUN] PATCH {url}")
        print(f"    {json.dumps(payload, default=str)[:200]}")
        return True

    for attempt in range(2):
        resp = session.patch(url, json=payload, headers=_build_headers(token))
        if resp.status_code in (200, 204):
            return True
        if resp.status_code == 429 and attempt == 0:
            retry_after = int(resp.headers.get("Retry-After", "5"))
            time.sleep(retry_after)
            continue
        print(
            f"  ERROR: PATCH {url} → {resp.status_code}: {resp.text[:600]}",
            file=sys.stderr,
        )
        return False
    return False


# ---------------------------------------------------------------------------
# Row building
# ---------------------------------------------------------------------------

_CHOICE_COLUMN_SUFFIXES = ("status", "state", "sequencetype", "valuetype", "event",
                            "source", "severity", "audience", "broadcaststatus",
                            "checkoutstatus", "reminderstage", "numbersequencestatus",
                            "drawingstate", "sheetstate", "checkoutreminderstage",
                            "recordtypechoice", "systemscopetype", "scopetype")

# Columns provisioned as MultiSelectPicklist (OData Edm.String) — choice values must be sent as strings.
_MULTISELECT_CHOICE_ATTRS = {"enmax_acdnaudience", "enmax_acdnevent", "enmax_acdnsource"}

# nvarchar columns whose names accidentally match _CHOICE_COLUMN_SUFFIXES — must not go through choice resolution.
_NON_CHOICE_COLUMNS = {"enmax_acdntostate", "enmax_acdnfromstate"}

# YAML short name → Dataverse logical column name (enmax_acdn* convention)
_COLUMN_REMAP: dict[str, str] = {
    "code":                     "enmax_acdncode",
    "display_name":             "enmax_acdndisplayname",
    "description":              "enmax_acdndescription",
    "status":                   "enmax_acdnstatus",
    "sort_order":               "enmax_acdnsortorder",
    "normalised_name":          "enmax_acdnnormalisedname",
    "sharepoint_library_url":   "enmax_acdnsharepointlibraryurl",
    "scope_type":               "enmax_acdnscopetype",
    "scope_value":              "enmax_acdnscopevalue",
    "active":                   "enmax_acdnactive",
    "key":                      "enmax_acdnkey",
    "value":                    "enmax_acdnvalue",
    "value_type":               "enmax_acdnvaluetype",
    "sequence_key":             "enmax_acdnsequencekey",
    "seed_value":               "enmax_acdnseedvalue",
    "name":                     "enmax_acdnname",
    "title":                    "enmax_acdntitle",
    "number":                   "enmax_acdnnumber",
    "filename":                 "enmax_acdnfilename",
}

# Lookup name in YAML → Dataverse navigation property name (SchemaName casing, not logical name)
_LOOKUP_REMAP: dict[str, str] = {
    "business":       "enmax_acdnBusiness",
    "asset":          "enmax_acdnAsset",
    "unit":           "enmax_acdnUnit",
    "domain":         "enmax_acdnDomain",
    "system":         "enmax_acdnSystem",
    "kind":           "enmax_acdnKind",
    "vendor":         "enmax_acdnVendor",
    "reservation":    "enmax_acdnReservation",
    "drawing":        "enmax_acdnDrawing",
    "broadcast":      "enmax_acdnBroadcast",
    "record_type":    "enmax_acdnRecordType",
    "record_phase":   "enmax_acdnRecordPhase",
    "checked_out_by": "enmax_acdnCheckedOutBy",
    "closed_by":      "enmax_acdnClosedBy",
    "recipient":      "enmax_acdnRecipient",
    "author":         "enmax_acdnAuthor",
    "user":           "enmax_acdnUser",
    "acted_by":       "enmax_acdnActedBy",
    "seeded_by":      "enmax_acdnSeededBy",
}


def _build_payload(row: dict, lookups: dict, loaded_rows: dict) -> dict:
    payload = {}
    for k, v in row.items():
        if k.startswith("_"):
            continue
        if "@odata.bind" in k:
            payload[k] = v
            continue
        dv_key = _COLUMN_REMAP.get(k, k)
        # MultiSelectPicklist columns (Edm.String) — convert int directly, resolve label to string
        if dv_key in _MULTISELECT_CHOICE_ATTRS:
            if isinstance(v, int):
                payload[dv_key] = str(v)
            elif isinstance(v, str):
                try:
                    payload[dv_key] = str(_resolve_choice(dv_key, v))
                except ValueError:
                    payload[dv_key] = v
        # Resolve regular Choice columns by label → int
        elif dv_key not in _NON_CHOICE_COLUMNS and isinstance(v, str) and any(dv_key.endswith(s) for s in _CHOICE_COLUMN_SUFFIXES):
            try:
                payload[dv_key] = _resolve_choice(dv_key, v)
            except ValueError:
                payload[dv_key] = v
        else:
            payload[dv_key] = v
    return payload


# ---------------------------------------------------------------------------
# Validation pass
# ---------------------------------------------------------------------------

def _validate_seed_file(data: dict, loaded_rows: dict) -> list[str]:
    errors: list[str] = []
    table = data.get("table", "")
    nk_cols = data.get("natural_key_columns", [])
    lookups = data.get("lookups", {})
    seen_keys: set[str] = set()

    for i, row in enumerate(data.get("rows", [])):
        row = _resolve_templates_in_row(row)
        # Natural key completeness
        for col in nk_cols:
            if not row.get(col):
                errors.append(f"{table}[{i}]: missing natural_key_column '{col}'")
        # Duplicate natural key
        try:
            nk = _natural_key(table, row, loaded_rows)
            if nk in seen_keys:
                errors.append(f"{table}[{i}]: duplicate natural key '{nk}'")
            seen_keys.add(nk)
        except ValueError as e:
            errors.append(f"{table}[{i}]: {e}")
        # Lookup FK resolution
        for lk_name, spec in lookups.items():
            src = spec["source_column"]
            if row.get(src) is None:
                continue
            parent_table = spec["table"]
            if parent_table not in loaded_rows:
                errors.append(
                    f"{table}[{i}]: lookup '{lk_name}' → '{parent_table}' not yet loaded"
                )
    return errors


# ---------------------------------------------------------------------------
# Main seed loop
# ---------------------------------------------------------------------------

def _seed_file(
    data: dict,
    session: requests.Session,
    dataverse_url: str,
    token: str,
    loaded_rows: dict,
    dry_run: bool,
    filter_table: str | None,
) -> int:
    table = data.get("table", "")
    if filter_table and table != filter_table:
        return 0

    lookups = data.get("lookups", {})
    nk_cols = data.get("natural_key_columns", [])
    errors = _validate_seed_file(data, loaded_rows)
    if errors:
        print(f"VALIDATION ERRORS in {table}:", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return len(errors)

    rows = data.get("rows", [])
    print(f"Seeding {table}: {len(rows)} rows")
    failed = 0
    loaded_rows.setdefault(table, {})

    for row in rows:
        row = _resolve_templates_in_row(row)
        try:
            nk = _natural_key(table, row, loaded_rows)
        except ValueError as e:
            print(f"  SKIP: {e}", file=sys.stderr)
            failed += 1
            continue

        row_id = deterministic_id(table, nk)
        resolved = _resolve_lookups(row, lookups, loaded_rows)
        payload = _build_payload(resolved, lookups, loaded_rows)

        ok = _upsert_row(session, dataverse_url, token, table, row_id, payload, dry_run)
        if ok:
            loaded_rows[table][nk] = row_id
        else:
            failed += 1

    return failed


def _fetch_systemuser_id(
    session: requests.Session, dataverse_url: str, token: str, email: str,
) -> str | None:
    """Return the systemuserid GUID for the given email, or None if not found."""
    url = f"{dataverse_url.rstrip('/')}/api/data/v9.2/systemusers"
    params = {
        "$filter": f"internalemailaddress eq '{email}'",
        "$select": "systemuserid",
        "$top": "1",
    }
    resp = session.get(url, params=params, headers=_build_headers(token))
    if resp.status_code == 200:
        values = resp.json().get("value", [])
        if values:
            return values[0]["systemuserid"]
    return None


def main() -> int:
    _load_env_local()

    parser = argparse.ArgumentParser(description="Seed Dataverse master data")
    parser.add_argument("--dry-run", action="store_true", help="Print payloads, no writes")
    parser.add_argument("--table", default=None, help="Seed only this table logical name")
    args = parser.parse_args()

    dataverse_url = _require_env("DATAVERSE_URL") if not args.dry_run else os.environ.get("DATAVERSE_URL", "https://example.crm.dynamics.com")
    client_id = _require_env("DATAVERSE_CLIENT_ID") if not args.dry_run else "x"
    client_secret = _require_env("DATAVERSE_CLIENT_SECRET") if not args.dry_run else "x"
    tenant_id = _require_env("DATAVERSE_TENANT_ID") if not args.dry_run else "x"

    token = ""
    if not args.dry_run:
        print("Acquiring MSAL token...")
        token = _get_token(client_id, client_secret, tenant_id, dataverse_url)
        print("Token acquired.")

    _load_option_sets()

    session = requests.Session()
    loaded_rows: dict[str, dict] = {}
    total_errors = 0

    # 1. Reference tables in dependency order
    ref_dir = SEED_DIR / "reference"
    for stem in REFERENCE_LOAD_ORDER:
        f = ref_dir / f"{stem}.yaml"
        if not f.exists():
            continue
        data = _load_yaml(f)
        total_errors += _seed_file(data, session, dataverse_url, token, loaded_rows, args.dry_run, args.table)

    # 2. App Configuration (independent)
    app_config_f = SEED_DIR / "app_config.yaml"
    if app_config_f.exists():
        data = _load_yaml(app_config_f)
        total_errors += _seed_file(data, session, dataverse_url, token, loaded_rows, args.dry_run, args.table)

    # 3. Number Sequences (optional)
    ns_f = SEED_DIR / "number_sequences.yaml"
    if ns_f.exists():
        data = _load_yaml(ns_f)
        rows = data.get("rows", [])
        if rows:
            total_errors += _seed_file(data, session, dataverse_url, token, loaded_rows, args.dry_run, args.table)

    # 4. Preload systemuser for sample data that requires user FKs
    # Always initialize the cache so _validate_seed_file doesn't fail on missing parent.
    loaded_rows.setdefault("systemuser", {})
    seed_user_email = os.environ.get("SEED_USER_EMAIL", "").strip()
    if seed_user_email and not args.dry_run:
        user_id = _fetch_systemuser_id(session, dataverse_url, token, seed_user_email)
        if user_id:
            loaded_rows["systemuser"] = {seed_user_email: user_id}
            print(f"Resolved SEED_USER_EMAIL '{seed_user_email}' → {user_id}")
        else:
            print(
                f"WARNING: SEED_USER_EMAIL '{seed_user_email}' not found in Dataverse "
                "— user-linked sample rows will be skipped.",
                file=sys.stderr,
            )

    # 5. Sample / test data
    sample_dir = SEED_DIR / "sample"
    if sample_dir.exists():
        for stem in SAMPLE_LOAD_ORDER:
            f = sample_dir / f"{stem}.yaml"
            if not f.exists():
                continue
            data = _load_yaml(f)
            total_errors += _seed_file(data, session, dataverse_url, token, loaded_rows, args.dry_run, args.table)

    if total_errors:
        print(f"\nSeed completed with {total_errors} errors.", file=sys.stderr)
        return 1

    print("\nSeed completed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
