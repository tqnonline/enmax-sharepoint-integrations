"""Provision all Dataverse schema for enmax_autocadsln.

Creates 18 global option sets, 23 custom tables with columns, lookup relationships,
and alternate keys. All components added to solution via MSCRM.SolutionUniqueName header.

Idempotent: checks existence before creating. Safe to re-run.

Usage:
    python solution/scripts/provision_schema.py [--dry-run]

Env vars (or .env.local at repo root):
    DATAVERSE_URL, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_TENANT_ID
"""

import argparse
import os
import shutil
import sys
import time
from pathlib import Path

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
OPTION_SETS_DIR = REPO_ROOT / "solution" / "seed" / "option_sets"
SOLUTION_NAME = "enmax_autocadsln"
LANG = 1033

# Aliases: .env.local key → canonical env var used by scripts
_ENV_ALIASES: dict[str, str] = {
    "ENVIRONMENT_URL": "DATAVERSE_URL",
    "CLIENT_ID":       "DATAVERSE_CLIENT_ID",
    "CLIENT_SECRET":   "DATAVERSE_CLIENT_SECRET",
    "TENANT_ID":       "DATAVERSE_TENANT_ID",
}


# ---------------------------------------------------------------------------
# Auth + env
# ---------------------------------------------------------------------------

def _main_repo_root() -> Path:
    """Walk up from REPO_ROOT to find the dir that owns .worktrees/."""
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
    # Alias .env.local names to canonical DATAVERSE_* names
    for src, dst in _ENV_ALIASES.items():
        if src in os.environ and dst not in os.environ:
            os.environ[dst] = os.environ[src]


def _require_env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        print(f"ERROR: {name} not set.", file=sys.stderr)
        sys.exit(1)
    return val


def _get_token(client_id: str, secret: str, tenant_id: str, dv_url: str) -> str:
    scope = dv_url.rstrip("/") + "/.default"
    app = msal.ConfidentialClientApplication(
        client_id, client_credential=secret,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
    )
    result = app.acquire_token_for_client(scopes=[scope])
    if "access_token" not in result:
        print(f"ERROR: MSAL: {result.get('error_description', result.get('error'))}", file=sys.stderr)
        sys.exit(1)
    return result["access_token"]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _meta_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "MSCRM.SolutionUniqueName": SOLUTION_NAME,
    }


def _exists(session: requests.Session, url: str, token: str, dry_run: bool = False) -> bool:
    if dry_run:
        return False  # always attempt creation in dry-run (idempotency check skipped)
    r = session.get(url, headers=_meta_headers(token))
    return r.status_code == 200


def _post_metadata(
    session: requests.Session, url: str, payload: dict, token: str,
    label: str, dry_run: bool,
) -> bool:
    if dry_run:
        print(f"  [DRY-RUN] POST {url.split('/api/')[1]} — {label}")
        return True
    for attempt in range(2):
        r = session.post(url, json=payload, headers=_meta_headers(token))
        if r.status_code in (200, 201, 204):
            print(f"  Created: {label}")
            return True
        if r.status_code == 429 and attempt == 0:
            time.sleep(int(r.headers.get("Retry-After", "10")))
            continue
        print(f"  ERROR {r.status_code} — {label}: {r.text[:300]}", file=sys.stderr)
        return False
    return False


def _put_metadata(
    session: requests.Session, url: str, payload: dict, token: str,
    label: str, dry_run: bool,
) -> bool:
    if dry_run:
        print(f"  [DRY-RUN] PUT {url.split('/api/')[1]} — {label}")
        return True
    headers = {**_meta_headers(token), "Prefer": "return=representation"}
    for attempt in range(2):
        r = session.put(url, json=payload, headers=headers)
        if r.status_code in (200, 201, 204):
            print(f"  Updated: {label}")
            return True
        if r.status_code == 429 and attempt == 0:
            time.sleep(int(r.headers.get("Retry-After", "10")))
            continue
        print(f"  ERROR {r.status_code} — {label}: {r.text[:300]}", file=sys.stderr)
        return False
    return False


# ---------------------------------------------------------------------------
# Metadata builders
# ---------------------------------------------------------------------------

def _lbl(text: str) -> dict:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        "LocalizedLabels": [{"@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                              "Label": text, "LanguageCode": LANG}],
    }


def _req(required: bool = False) -> dict:
    return {
        "Value": "ApplicationRequired" if required else "None",
        "CanBeChanged": True,
        "ManagedPropertyLogicalName": "canmodifyrequirementlevelsettings",
    }


def _str_attr(schema: str, display: str, max_len: int = 200,
              required: bool = False, primary: bool = False,
              autonumber: str | None = None) -> dict:
    a: dict = {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "SchemaName": schema,
        "LogicalName": schema.lower(),
        "DisplayName": _lbl(display),
        "RequiredLevel": _req(required),
        "MaxLength": max_len,
    }
    if primary:
        a["IsPrimaryName"] = True
    if autonumber:
        a["AutoNumberFormat"] = autonumber
    return a


def _memo_attr(schema: str, display: str, max_len: int = 2000,
               required: bool = False) -> dict:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        "SchemaName": schema,
        "LogicalName": schema.lower(),
        "DisplayName": _lbl(display),
        "RequiredLevel": _req(required),
        "MaxLength": max_len,
    }


def _int_attr(schema: str, display: str, required: bool = False,
              min_val: int = -2147483648, max_val: int = 2147483647) -> dict:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
        "SchemaName": schema,
        "LogicalName": schema.lower(),
        "DisplayName": _lbl(display),
        "RequiredLevel": _req(required),
        "MinValue": min_val,
        "MaxValue": max_val,
    }


def _choice_attr(schema: str, display: str, option_set_name: str,
                 required: bool = False, multiselect: bool = False) -> dict:
    otype = ("Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata"
             if multiselect else "Microsoft.Dynamics.CRM.PicklistAttributeMetadata")
    return {
        "@odata.type": otype,
        "SchemaName": schema,
        "LogicalName": schema.lower(),
        "DisplayName": _lbl(display),
        "RequiredLevel": _req(required),
        "OptionSet": {
            "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
            "IsGlobal": True,
            "Name": option_set_name,
        },
    }


def _bool_attr(schema: str, display: str, default: bool = False,
               required: bool = False) -> dict:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        "SchemaName": schema,
        "LogicalName": schema.lower(),
        "DisplayName": _lbl(display),
        "RequiredLevel": _req(required),
        "DefaultValue": default,
        "OptionSet": {
            "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
            "TrueOption": {"Value": 1, "Label": _lbl("Yes")},
            "FalseOption": {"Value": 0, "Label": _lbl("No")},
        },
    }


def _dt_attr(schema: str, display: str, required: bool = False,
             date_only: bool = False) -> dict:
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        "SchemaName": schema,
        "LogicalName": schema.lower(),
        "DisplayName": _lbl(display),
        "RequiredLevel": _req(required),
        "Format": "DateOnly" if date_only else "DateAndTime",
        "DateTimeBehavior": {"Value": "UserLocal"},
    }


# ---------------------------------------------------------------------------
# Schema: reference table standard columns
# ---------------------------------------------------------------------------

def _ref_attrs(primary_schema: str = "enmax_acdnDisplayName") -> list:
    return [
        _str_attr("enmax_acdnDisplayName", "Display Name", 128, required=True, primary=True),
        _str_attr("enmax_acdnCode", "Code", 100, required=True),
        _memo_attr("enmax_acdnDescription", "Description", 2000),
        _choice_attr("enmax_acdnStatus", "Status", "enmax_acdn_recordstatus"),
        _int_attr("enmax_acdnSortOrder", "Sort Order", min_val=0, max_val=99999),
    ]


# ---------------------------------------------------------------------------
# Table definitions
# ---------------------------------------------------------------------------

# Each entry: (logical_name, display_name, plural_display_name, primary_attr, [attrs])
# primary_attr = schema name of the primary name attribute (lowercase)

TABLE_DEFS: list[dict] = [
    # --- Reference tables ---
    {
        "logical": "enmax_autocadbusiness",
        "display": "Business",
        "plural": "Businesses",
        "primary_attr": "enmax_acdndisplayname",
        "attrs": _ref_attrs(),
    },
    {
        "logical": "enmax_autocadasset",
        "display": "Asset",
        "plural": "Assets",
        "primary_attr": "enmax_acdndisplayname",
        "attrs": _ref_attrs(),
    },
    {
        "logical": "enmax_autocadunit",
        "display": "Unit",
        "plural": "Units",
        "primary_attr": "enmax_acdndisplayname",
        "attrs": _ref_attrs(),
    },
    {
        "logical": "enmax_autocaddomain",
        "display": "Domain",
        "plural": "Domains",
        "primary_attr": "enmax_acdndisplayname",
        "attrs": _ref_attrs(),
    },
    {
        "logical": "enmax_autocadsystem",
        "display": "System",
        "plural": "Systems",
        "primary_attr": "enmax_acdndisplayname",
        "attrs": _ref_attrs(),
    },
    {
        "logical": "enmax_autocadkind",
        "display": "Kind",
        "plural": "Kinds",
        "primary_attr": "enmax_acdndisplayname",
        "attrs": _ref_attrs(),
    },
    {
        "logical": "enmax_autocadrecordtype",
        "display": "Record Type",
        "plural": "Record Types",
        "primary_attr": "enmax_acdndisplayname",
        "attrs": _ref_attrs(),
    },
    {
        "logical": "enmax_autocadrecordphase",
        "display": "Record Phase",
        "plural": "Record Phases",
        "primary_attr": "enmax_acdndisplayname",
        "attrs": _ref_attrs(),
    },
    {
        "logical": "enmax_autocadvendor",
        "display": "Vendor",
        "plural": "Vendors",
        "primary_attr": "enmax_acdndisplayname",
        "attrs": _ref_attrs() + [
            _str_attr("enmax_acdnNormalisedName", "Normalised Name", 256),
        ],
    },
    {
        "logical": "enmax_autocadbusinessasset",
        "display": "Approved BB-AA Combination",
        "plural": "Approved BB-AA Combinations",
        "primary_attr": "enmax_acdnname",
        "attrs": [
            _str_attr("enmax_acdnName", "Name", 200, primary=True),
        ],
    },
    {
        "logical": "enmax_autocadassetunit",
        "display": "Asset-Unit",
        "plural": "Asset-Units",
        "primary_attr": "enmax_acdnname",
        "attrs": [
            _str_attr("enmax_acdnName", "Name", 200, primary=True),
            _str_attr("enmax_acdnSharePointLibraryUrl", "SharePoint Library URL", 1000),
        ],
    },
    {
        "logical": "enmax_autocadsystemscope",
        "display": "System Scoping Rule",
        "plural": "System Scoping Rules",
        "primary_attr": "enmax_acdnname",
        "attrs": [
            _str_attr("enmax_acdnName", "Name", 200, primary=True),
            _choice_attr("enmax_acdnScopeType", "Scope Type", "enmax_acdn_systemscopetype", required=True),
            _str_attr("enmax_acdnScopeValue", "Scope Value", 100),
            _bool_attr("enmax_acdnActive", "Active", default=True),
        ],
    },
    # --- Transactional tables ---
    {
        "logical": "enmax_autocadreservation",
        "display": "Reservation",
        "plural": "Reservations",
        "primary_attr": "enmax_acdnreservationid",
        "attrs": [
            _str_attr("enmax_acdnReservationId", "Reservation ID", 100, primary=True,
                      autonumber="RES-{SEQNUM:00000}"),
            _int_attr("enmax_acdnDrawingCount", "Drawing Count", required=True, min_val=1, max_val=100),
            _int_attr("enmax_acdnSheetsPerDrawing", "Sheets Per Drawing", required=True, min_val=1, max_val=999),
            _choice_attr("enmax_acdnSequenceType", "Sequence Type", "enmax_acdn_sequencetype", required=True),
            _memo_attr("enmax_acdnReason", "Reason for Reservation", 2000, required=True),
            _bool_attr("enmax_acdnOverride", "Soft Validation Override", default=False),
            _memo_attr("enmax_acdnOverrideReason", "Override Justification"),
            _choice_attr("enmax_acdnStatus", "Status", "enmax_acdn_reservationstatus"),
            _memo_attr("enmax_acdnDeclineReason", "Decline Reason"),
            _dt_attr("enmax_acdnApprovedOn", "Approved On"),
            _memo_attr("enmax_acdnIssuedNumbers", "Issued Numbers"),
        ],
    },
    {
        "logical": "enmax_autocaddrawing",
        "display": "Drawing",
        "plural": "Drawings",
        "primary_attr": "enmax_acdnnumber",
        "attrs": [
            _str_attr("enmax_acdnNumber", "ENMAX Number", 100, primary=True),
            _int_attr("enmax_acdnSequenceNumber", "Sequence Number", min_val=0, max_val=9999),
            _str_attr("enmax_acdnTitle", "Title", 500, required=True),
            _str_attr("enmax_acdnVendorDocNumber", "Vendor Document Number", 200),
            _int_attr("enmax_acdnSheetCount", "Sheet Count", min_val=1, max_val=999),
            _str_attr("enmax_acdnCurrentRevision", "Current Revision", 50),
            _dt_attr("enmax_acdnRevisionDate", "Revision Date", date_only=True),
            _str_attr("enmax_acdnAssetTag", "Asset Tag", 200),
            _str_attr("enmax_acdnSpLibraryUrl", "SharePoint Library URL", 1000),
            _choice_attr("enmax_acdnState", "State", "enmax_acdn_drawingstate"),
            _memo_attr("enmax_acdnMissingSheets", "Missing Sheets"),
        ],
    },
    {
        "logical": "enmax_autocadsheet",
        "display": "Sheet",
        "plural": "Sheets",
        "primary_attr": "enmax_acdnfilename",
        "attrs": [
            _str_attr("enmax_acdnFilename", "Filename", 500, primary=True),
            _int_attr("enmax_acdnSheetNumber", "Sheet Number", required=True, min_val=1, max_val=999),
            _str_attr("enmax_acdnSharePointUrl", "SharePoint URL", 1000),
            _str_attr("enmax_acdnSharePointItemId", "SharePoint Item ID", 100),
            _choice_attr("enmax_acdnState", "State", "enmax_acdn_sheetstate"),
        ],
    },
    {
        "logical": "enmax_autocadcheckout",
        "display": "Checkout",
        "plural": "Checkouts",
        "primary_attr": "enmax_acdnname",
        "attrs": [
            _str_attr("enmax_acdnName", "Name", 200, primary=True),
            _dt_attr("enmax_acdnCheckedOutOn", "Checked Out On", required=True),
            _choice_attr("enmax_acdnStatus", "Status", "enmax_acdn_checkoutstatus"),
            _str_attr("enmax_acdnNewRevision", "New Revision", 50),
            _memo_attr("enmax_acdnNewPdfUrls", "New PDF URLs"),
            _memo_attr("enmax_acdnValidationReason", "Validation Reason"),
            _choice_attr("enmax_acdnReminderStage", "Reminder Stage", "enmax_acdn_checkoutreminderstage"),
            _dt_attr("enmax_acdnClosedOn", "Closed On"),
        ],
    },
    {
        "logical": "enmax_autocadnumbersequence",
        "display": "Number Sequence",
        "plural": "Number Sequences",
        "primary_attr": "enmax_acdnsequencekey",
        "attrs": [
            _str_attr("enmax_acdnSequenceKey", "Sequence Key", 100, required=True, primary=True),
            _int_attr("enmax_acdnSeedValue", "Seed Value", min_val=0, max_val=9998),
            _int_attr("enmax_acdnLastIssued", "Last Issued", min_val=0, max_val=9999),
            _dt_attr("enmax_acdnLastIssuedAt", "Last Issued At"),
            _dt_attr("enmax_acdnSeededOn", "Seeded On"),
            _memo_attr("enmax_acdnSeedReason", "Seed Reason"),
            _choice_attr("enmax_acdnStatus", "Status", "enmax_acdn_numbersequencestatus"),
        ],
    },
    {
        "logical": "enmax_autocadappconfig",
        "display": "App Configuration",
        "plural": "App Configurations",
        "primary_attr": "enmax_acdnkey",
        "attrs": [
            _str_attr("enmax_acdnKey", "Key", 200, required=True, primary=True),
            _memo_attr("enmax_acdnValue", "Value"),
            _choice_attr("enmax_acdnValueType", "Value Type", "enmax_acdn_appconfigvaluetype"),
            _memo_attr("enmax_acdnDescription", "Description"),
        ],
    },
    {
        "logical": "enmax_autocadauditevent",
        "display": "Audit Event",
        "plural": "Audit Events",
        "primary_attr": "enmax_acdnname",
        "attrs": [
            _str_attr("enmax_acdnName", "Name", 200, primary=True),
            _str_attr("enmax_acdnSubjectTable", "Subject Table", 200),
            _str_attr("enmax_acdnSubjectId", "Subject ID", 100),
            _choice_attr("enmax_acdnEvent", "Event", "enmax_acdn_auditevent"),
            _str_attr("enmax_acdnFromState", "From State", 100),
            _str_attr("enmax_acdnToState", "To State", 100),
            _memo_attr("enmax_acdnReason", "Reason"),
            _choice_attr("enmax_acdnSource", "Source", "enmax_acdn_auditsource"),
        ],
    },
    {
        "logical": "enmax_autocadinappnotification",
        "display": "In-App Notification",
        "plural": "In-App Notifications",
        "primary_attr": "enmax_acdntitle",
        "attrs": [
            _str_attr("enmax_acdnTitle", "Title", 500, required=True, primary=True),
            _memo_attr("enmax_acdnBody", "Body"),
            _choice_attr("enmax_acdnSeverity", "Severity", "enmax_acdn_notificationseverity"),
            _choice_attr("enmax_acdnSourceEvent", "Source Event", "enmax_acdn_sourceevent"),
            _str_attr("enmax_acdnSubjectTable", "Subject Table", 200),
            _str_attr("enmax_acdnSubjectId", "Subject ID", 100),
            _str_attr("enmax_acdnDeepLinkPath", "Deep Link Path", 500),
            _bool_attr("enmax_acdnRead", "Read", default=False),
            _dt_attr("enmax_acdnReadOn", "Read On"),
        ],
    },
    {
        "logical": "enmax_autocadbroadcast",
        "display": "Broadcast",
        "plural": "Broadcasts",
        "primary_attr": "enmax_acdntitle",
        "attrs": [
            _str_attr("enmax_acdnTitle", "Title", 500, required=True, primary=True),
            _memo_attr("enmax_acdnBody", "Body"),
            _choice_attr("enmax_acdnSeverity", "Severity", "enmax_acdn_broadcastseverity"),
            _choice_attr("enmax_acdnAudience", "Audience", "enmax_acdn_broadcastaudience",
                         multiselect=True),
            _dt_attr("enmax_acdnStartsAt", "Starts At"),
            _dt_attr("enmax_acdnExpiresAt", "Expires At"),
            _bool_attr("enmax_acdnRequiresAck", "Requires Acknowledgement", default=False),
            _choice_attr("enmax_acdnStatus", "Status", "enmax_acdn_broadcaststatus"),
            _bool_attr("enmax_acdnPinned", "Pinned", default=False),
        ],
    },
    {
        "logical": "enmax_autocadbroadcastdismissal",
        "display": "Broadcast Dismissal",
        "plural": "Broadcast Dismissals",
        "primary_attr": "enmax_acdnname",
        "attrs": [
            _str_attr("enmax_acdnName", "Name", 200, primary=True),
            _bool_attr("enmax_acdnAcknowledged", "Acknowledged", default=False),
            _dt_attr("enmax_acdnDismissedOn", "Dismissed On"),
        ],
    },
    {
        "logical": "enmax_autocaduserpreference",
        "display": "User Preference",
        "plural": "User Preferences",
        "primary_attr": "enmax_acdnname",
        "attrs": [
            _str_attr("enmax_acdnName", "Name", 200, primary=True),
            _bool_attr("enmax_acdnEmailEnabled", "Email Enabled", default=True),
            _bool_attr("enmax_acdnTeamsEnabled", "Teams Enabled", default=True),
        ],
    },
]


# ---------------------------------------------------------------------------
# Relationship definitions
# Each: (schema, referencing_table, referencing_attr, attr_display,
#        referenced_table, required, cascade_delete)
# ---------------------------------------------------------------------------

def _rel(schema: str, ref_ing: str, attr: str, attr_display: str,
         ref_ed: str, required: bool = False, cascade_delete: bool = False) -> dict:
    cascade = "Cascade" if cascade_delete else "RemoveLink"
    return {
        "schema": schema,
        "referencing": ref_ing,
        "attr": attr,
        "attr_display": attr_display,
        "referenced": ref_ed,
        "required": required,
        "cascade": cascade,
    }


RELATIONSHIP_DEFS: list[dict] = [
    # Reference table lookups
    _rel("enmax_business_enmax_asset", "enmax_autocadasset", "enmax_acdnBusiness", "Business",
         "enmax_autocadbusiness"),
    _rel("enmax_asset_enmax_unit", "enmax_autocadunit", "enmax_acdnAsset", "Asset",
         "enmax_autocadasset"),
    # BusinessAsset junction
    _rel("enmax_business_enmax_businessasset", "enmax_autocadbusinessasset",
         "enmax_acdnBusiness", "Business", "enmax_autocadbusiness", required=True),
    _rel("enmax_asset_enmax_businessasset", "enmax_autocadbusinessasset",
         "enmax_acdnAsset", "Asset", "enmax_autocadasset", required=True),
    # AssetUnit junction
    _rel("enmax_asset_enmax_assetunit", "enmax_autocadassetunit",
         "enmax_acdnAsset", "Asset", "enmax_autocadasset", required=True),
    _rel("enmax_unit_enmax_assetunit", "enmax_autocadassetunit",
         "enmax_acdnUnit", "Unit", "enmax_autocadunit", required=True),
    # SystemScope
    _rel("enmax_system_enmax_systemscope", "enmax_autocadsystemscope",
         "enmax_acdnSystem", "System", "enmax_autocadsystem", required=True),
    # Reservation lookups
    _rel("enmax_business_enmax_reservation", "enmax_autocadreservation",
         "enmax_acdnBusiness", "Business", "enmax_autocadbusiness", required=True),
    _rel("enmax_asset_enmax_reservation", "enmax_autocadreservation",
         "enmax_acdnAsset", "Asset", "enmax_autocadasset", required=True),
    _rel("enmax_unit_enmax_reservation", "enmax_autocadreservation",
         "enmax_acdnUnit", "Unit", "enmax_autocadunit", required=True),
    _rel("enmax_domain_enmax_reservation", "enmax_autocadreservation",
         "enmax_acdnDomain", "Domain", "enmax_autocaddomain", required=True),
    _rel("enmax_system_enmax_reservation", "enmax_autocadreservation",
         "enmax_acdnSystem", "System", "enmax_autocadsystem", required=True),
    _rel("enmax_kind_enmax_reservation", "enmax_autocadreservation",
         "enmax_acdnKind", "Kind", "enmax_autocadkind", required=True),
    _rel("enmax_sysuser_approver_reservation", "enmax_autocadreservation",
         "enmax_acdnApprover", "Approver", "systemuser"),
    # Drawing lookups
    _rel("enmax_business_enmax_drawing", "enmax_autocaddrawing",
         "enmax_acdnBusiness", "Business", "enmax_autocadbusiness"),
    _rel("enmax_asset_enmax_drawing", "enmax_autocaddrawing",
         "enmax_acdnAsset", "Asset", "enmax_autocadasset"),
    _rel("enmax_unit_enmax_drawing", "enmax_autocaddrawing",
         "enmax_acdnUnit", "Unit", "enmax_autocadunit"),
    _rel("enmax_domain_enmax_drawing", "enmax_autocaddrawing",
         "enmax_acdnDomain", "Domain", "enmax_autocaddomain"),
    _rel("enmax_system_enmax_drawing", "enmax_autocaddrawing",
         "enmax_acdnSystem", "System", "enmax_autocadsystem"),
    _rel("enmax_kind_enmax_drawing", "enmax_autocaddrawing",
         "enmax_acdnKind", "Kind", "enmax_autocadkind"),
    _rel("enmax_vendor_enmax_drawing", "enmax_autocaddrawing",
         "enmax_acdnVendor", "Vendor", "enmax_autocadvendor"),
    _rel("enmax_recordphase_enmax_drawing", "enmax_autocaddrawing",
         "enmax_acdnRecordPhase", "Record Phase", "enmax_autocadrecordphase"),
    _rel("enmax_recordtype_enmax_drawing", "enmax_autocaddrawing",
         "enmax_acdnRecordType", "Record Type", "enmax_autocadrecordtype"),
    _rel("enmax_reservation_enmax_drawing", "enmax_autocaddrawing",
         "enmax_acdnReservation", "Reservation", "enmax_autocadreservation"),
    # Sheet lookup
    _rel("enmax_drawing_enmax_sheet", "enmax_autocadsheet",
         "enmax_acdnDrawing", "Drawing", "enmax_autocaddrawing",
         required=True, cascade_delete=True),
    # Checkout lookups
    _rel("enmax_drawing_enmax_checkout", "enmax_autocadcheckout",
         "enmax_acdnDrawing", "Drawing", "enmax_autocaddrawing", required=True),
    _rel("enmax_sysuser_checkedoutby", "enmax_autocadcheckout",
         "enmax_acdnCheckedOutBy", "Checked Out By", "systemuser", required=True),
    _rel("enmax_sysuser_closedby", "enmax_autocadcheckout",
         "enmax_acdnClosedBy", "Closed By", "systemuser"),
    # Number Sequence lookups
    _rel("enmax_business_enmax_numseq", "enmax_autocadnumbersequence",
         "enmax_acdnBusiness", "Business", "enmax_autocadbusiness"),
    _rel("enmax_asset_enmax_numseq", "enmax_autocadnumbersequence",
         "enmax_acdnAsset", "Asset", "enmax_autocadasset"),
    _rel("enmax_unit_enmax_numseq", "enmax_autocadnumbersequence",
         "enmax_acdnUnit", "Unit", "enmax_autocadunit"),
    _rel("enmax_domain_enmax_numseq", "enmax_autocadnumbersequence",
         "enmax_acdnDomain", "Domain", "enmax_autocaddomain"),
    _rel("enmax_system_enmax_numseq", "enmax_autocadnumbersequence",
         "enmax_acdnSystem", "System", "enmax_autocadsystem"),
    _rel("enmax_kind_enmax_numseq", "enmax_autocadnumbersequence",
         "enmax_acdnKind", "Kind", "enmax_autocadkind"),
    _rel("enmax_sysuser_seededby", "enmax_autocadnumbersequence",
         "enmax_acdnSeededBy", "Seeded By", "systemuser"),
    # Audit Event lookups
    _rel("enmax_sysuser_actedby", "enmax_autocadauditevent",
         "enmax_acdnActedBy", "Acted By", "systemuser"),
    _rel("enmax_sysuser_actedonbehalfof", "enmax_autocadauditevent",
         "enmax_acdnActedOnBehalfOf", "Acted On Behalf Of", "systemuser"),
    # In-App Notification lookup
    _rel("enmax_sysuser_notification_recipient", "enmax_autocadinappnotification",
         "enmax_acdnRecipient", "Recipient", "systemuser", required=True),
    # Broadcast author
    _rel("enmax_sysuser_broadcast_author", "enmax_autocadbroadcast",
         "enmax_acdnAuthor", "Author", "systemuser"),
    # Broadcast Dismissal lookups
    _rel("enmax_broadcast_enmax_dismissal", "enmax_autocadbroadcastdismissal",
         "enmax_acdnBroadcast", "Broadcast", "enmax_autocadbroadcast", required=True),
    _rel("enmax_sysuser_enmax_dismissal", "enmax_autocadbroadcastdismissal",
         "enmax_acdnUser", "User", "systemuser", required=True),
    # User Preference lookup
    _rel("enmax_sysuser_enmax_userpref", "enmax_autocaduserpreference",
         "enmax_acdnUser", "User", "systemuser", required=True),
]


# ---------------------------------------------------------------------------
# Alternate key definitions
# Each: (table, schema_name, display, [column_logical_names])
# ---------------------------------------------------------------------------

ALTERNATE_KEY_DEFS: list[dict] = [
    {
        "table": "enmax_autocadnumbersequence",
        "schema": "enmax_acdnsequencekey_ak",
        "display": "Sequence Key",
        "columns": ["enmax_acdnsequencekey"],
    },
    {
        "table": "enmax_autocaddrawing",
        "schema": "enmax_acdnnumber_ak",
        "display": "ENMAX Number",
        "columns": ["enmax_acdnnumber"],
    },
    {
        "table": "enmax_autocadsheet",
        "schema": "enmax_acdnsheet_drawing_num_ak",
        "display": "Drawing + Sheet Number",
        "columns": ["enmax_acdndrawing", "enmax_acdnsheetnumber"],
    },
    {
        "table": "enmax_autocadcheckout",
        "schema": "enmax_acdncheckout_drawing_status_ak",
        "display": "Drawing + Status",
        "columns": ["enmax_acdndrawing", "enmax_acdnstatus"],
    },
    {
        "table": "enmax_autocadbroadcastdismissal",
        "schema": "enmax_acdndismissal_broadcast_user_ak",
        "display": "Broadcast + User",
        "columns": ["enmax_acdnbroadcast", "enmax_acdnuser"],
    },
    {
        "table": "enmax_autocadbusinessasset",
        "schema": "enmax_acdnbusinessasset_ak",
        "display": "Business + Asset",
        "columns": ["enmax_acdnbusiness", "enmax_acdnasset"],
    },
    {
        "table": "enmax_autocadassetunit",
        "schema": "enmax_acdnassetunit_ak",
        "display": "Asset + Unit",
        "columns": ["enmax_acdnasset", "enmax_acdnunit"],
    },
]


# ---------------------------------------------------------------------------
# Provisioning functions
# ---------------------------------------------------------------------------

def _provision_option_sets(
    session: requests.Session, base: str, token: str, dry_run: bool,
) -> int:
    errors = 0
    for f in sorted(OPTION_SETS_DIR.glob("*.yaml")):
        data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        name = data["schema_name"]
        display = data["display_name"]
        values = data.get("values", [])

        check_url = f"{base}/api/data/v9.2/GlobalOptionSetDefinitions(Name='{name}')"
        if _exists(session, check_url, token, dry_run):
            print(f"  Exists: option set {name}")
            continue

        options = []
        for v in values:
            options.append({
                "Value": v["value"],
                "Label": _lbl(v["label"]),
                "Description": {"@odata.type": "Microsoft.Dynamics.CRM.Label",
                                 "LocalizedLabels": []},
            })

        payload = {
            "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
            "IsGlobal": True,
            "OptionSetType": "Picklist",
            "Name": name,
            "DisplayName": _lbl(display),
            "Description": {"@odata.type": "Microsoft.Dynamics.CRM.Label",
                             "LocalizedLabels": []},
            "Options": options,
        }
        url = f"{base}/api/data/v9.2/GlobalOptionSetDefinitions"
        if not _post_metadata(session, url, payload, token, f"option set {name}", dry_run):
            errors += 1
    return errors


def _provision_tables(
    session: requests.Session, base: str, token: str, dry_run: bool,
) -> int:
    errors = 0
    for tbl in TABLE_DEFS:
        logical = tbl["logical"]
        check_url = f"{base}/api/data/v9.2/EntityDefinitions(LogicalName='{logical}')"
        if _exists(session, check_url, token, dry_run):
            print(f"  Exists: table {logical} — checking for missing attributes")
            # Add any missing non-primary attrs to existing table
            for attr in tbl["attrs"]:
                if attr.get("IsPrimaryName"):
                    continue
                schema = attr["SchemaName"]
                attr_check = (f"{base}/api/data/v9.2/EntityDefinitions"
                              f"(LogicalName='{logical}')/Attributes"
                              f"(LogicalName='{schema.lower()}')")
                if _exists(session, attr_check, token, dry_run):
                    # PATCH string attrs to update MaxLength if changed
                    odata_type = attr.get("@odata.type", "")
                    if "StringAttributeMetadata" in odata_type and not dry_run:
                        r = session.get(attr_check, headers=_meta_headers(token))
                        if r.ok:
                            existing = r.json()
                            if existing.get("MaxLength") != attr.get("MaxLength"):
                                patch_url = attr_check
                                patch_payload = {**attr}
                                if not _put_metadata(session, patch_url, patch_payload,
                                                     token, f"attr {logical}.{schema} (MaxLength)",
                                                     dry_run):
                                    errors += 1
                    continue
                url = f"{base}/api/data/v9.2/EntityDefinitions(LogicalName='{logical}')/Attributes"
                if not _post_metadata(session, url, attr, token,
                                      f"attr {logical}.{schema}", dry_run):
                    errors += 1
            continue

        payload = {
            "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
            "LogicalName": logical,
            "SchemaName": logical,
            "DisplayName": _lbl(tbl["display"]),
            "DisplayCollectionName": _lbl(tbl["plural"]),
            "OwnershipType": "UserOwned",
            "HasActivities": False,
            "HasNotes": False,
            "IsActivity": False,
            "PrimaryNameAttribute": tbl["primary_attr"],
            "Attributes": tbl["attrs"],
        }
        url = f"{base}/api/data/v9.2/EntityDefinitions"
        if not _post_metadata(session, url, payload, token,
                              f"table {logical}", dry_run):
            errors += 1
    return errors


def _provision_relationships(
    session: requests.Session, base: str, token: str, dry_run: bool,
) -> int:
    errors = 0
    for rel in RELATIONSHIP_DEFS:
        schema = rel["schema"]
        check_url = f"{base}/api/data/v9.2/RelationshipDefinitions(SchemaName='{schema}')"
        if _exists(session, check_url, token, dry_run):
            print(f"  Exists: relationship {schema}")
            continue

        attr_schema = rel["attr"]
        payload = {
            "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
            "SchemaName": schema,
            "ReferencingEntity": rel["referencing"],
            "ReferencedEntity": rel["referenced"],
            "Lookup": {
                "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
                "SchemaName": attr_schema,
                "LogicalName": attr_schema.lower(),
                "DisplayName": _lbl(rel["attr_display"]),
                "RequiredLevel": _req(rel["required"]),
            },
            "AssociatedMenuConfiguration": {
                "Behavior": "UseCollectionName",
                "Group": "Details",
                "Order": 10000,
            },
            "CascadeConfiguration": {
                "Assign": "NoCascade",
                "Delete": rel["cascade"],
                "Merge": "NoCascade",
                "Reparent": "NoCascade",
                "Share": "NoCascade",
                "Unshare": "NoCascade",
            },
        }
        url = f"{base}/api/data/v9.2/RelationshipDefinitions"
        if not _post_metadata(session, url, payload, token,
                              f"relationship {schema}", dry_run):
            errors += 1
    return errors


def _provision_alternate_keys(
    session: requests.Session, base: str, token: str, dry_run: bool,
) -> int:
    errors = 0
    for key in ALTERNATE_KEY_DEFS:
        table = key["table"]
        schema = key["schema"]

        # Check if key exists by listing all keys for the table
        list_url = f"{base}/api/data/v9.2/EntityDefinitions(LogicalName='{table}')/Keys"
        if not dry_run:
            r = session.get(list_url, headers=_meta_headers(token))
            if r.status_code == 200:
                existing = [k["SchemaName"] for k in r.json().get("value", [])]
                if schema in existing:
                    print(f"  Exists: alternate key {schema}")
                    continue

        payload = {
            "@odata.type": "Microsoft.Dynamics.CRM.EntityKeyMetadata",
            "SchemaName": schema,
            "DisplayName": _lbl(key["display"]),
            "KeyAttributes": key["columns"],
        }
        url = f"{base}/api/data/v9.2/EntityDefinitions(LogicalName='{table}')/Keys"
        if not _post_metadata(session, url, payload, token,
                              f"alternate key {schema}", dry_run):
            errors += 1
    return errors


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    _load_env_local()

    parser = argparse.ArgumentParser(description="Provision Dataverse schema for enmax_autocadsln")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be created, no writes")
    args = parser.parse_args()

    dry_run = args.dry_run
    base = _require_env("DATAVERSE_URL").rstrip("/") if not dry_run else "https://example.crm3.dynamics.com"
    token = ""
    if not dry_run:
        print("Acquiring MSAL token...")
        token = _get_token(
            _require_env("DATAVERSE_CLIENT_ID"),
            _require_env("DATAVERSE_CLIENT_SECRET"),
            _require_env("DATAVERSE_TENANT_ID"),
            base,
        )
        print("Token acquired.")

    session = requests.Session()
    total_errors = 0

    print("\n--- Phase 1: Option Sets ---")
    total_errors += _provision_option_sets(session, base, token, dry_run)

    print("\n--- Phase 2: Tables + Columns ---")
    total_errors += _provision_tables(session, base, token, dry_run)

    print("\n--- Phase 3: Relationships (Lookup Columns) ---")
    total_errors += _provision_relationships(session, base, token, dry_run)

    print("\n--- Phase 4: Alternate Keys ---")
    total_errors += _provision_alternate_keys(session, base, token, dry_run)

    if total_errors:
        print(f"\nProvisioning completed with {total_errors} error(s).", file=sys.stderr)
        return 1
    print("\nProvisioning completed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
