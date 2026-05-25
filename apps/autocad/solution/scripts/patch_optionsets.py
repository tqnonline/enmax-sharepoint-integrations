"""Patch Dataverse global option set labels to match the solution XML definitions.

Uses the Dataverse Web API UpdateOptionValue unbound action so this can be run
as a lightweight patch without a full solution import.

Reads DATAVERSE_URL, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_TENANT_ID
from the environment (or .env.local at repo root).

Usage:
    python solution/scripts/patch_optionsets.py [--dry-run]
"""

import argparse
import os
import sys
from pathlib import Path

import requests

try:
    import msal
except ImportError:
    print("ERROR: msal not installed. Run: uv pip install msal", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

_ENV_ALIASES: dict[str, str] = {
    "ENVIRONMENT_URL": "DATAVERSE_URL",
    "CLIENT_ID":       "DATAVERSE_CLIENT_ID",
    "CLIENT_SECRET":   "DATAVERSE_CLIENT_SECRET",
    "TENANT_ID":       "DATAVERSE_TENANT_ID",
}

# ---------------------------------------------------------------------------
# Option set patches — must match the solution XML exactly.
# ---------------------------------------------------------------------------
OPTIONSET_PATCHES: dict[str, list[tuple[int, str]]] = {
    "enmax_acdn_drawingstate": [
        (0, "None"),
        (1, "Available"),
        (2, "Checked Out"),
        (3, "Awaiting Validation"),
        (4, "Checked In"),
        (5, "Obsolete"),
        (6, "Void"),
        (7, "Finalized"),
    ],
    "enmax_acdn_sheetstate": [
        (0, "None"),
        (1, "Pending Initial Upload"),
        (2, "Available"),
        (3, "Checked Out"),
        (4, "Awaiting Validation"),
        (5, "Obsolete"),
        (6, "Void"),
        (7, "Finalized"),
    ],
    "enmax_acdn_checkoutstatus": [
        (0, "None"),
        (1, "Open"),
        (2, "Awaiting Validation"),
        (3, "Closed Approved"),
        (4, "Closed Declined"),
        (5, "Closed Forced"),
    ],
    "enmax_acdn_reservationstatus": [
        (0, "None"),
        (1, "Pending"),
        (2, "Approved"),
        (3, "Declined"),
        (4, "Cancelled"),
    ],
    "enmax_acdn_auditevent": [
        (0, "None"),
        (1, "Created"),
        (2, "State Changed"),
        (3, "Approval Granted"),
        (4, "Approval Denied"),
        (5, "Override Used"),
        (6, "Force Checked In"),
        (7, "Config Changed"),
        (8, "Reference Data Changed"),
        (9, "Finalized"),
    ],
    "enmax_acdn_auditsource": [
        (0, "None"),
        (1, "Code App"),
        (2, "Admin App"),
        (3, "Flow"),
        (4, "Action"),
    ],
    "enmax_acdn_checkoutreminderstage": [
        (0, "None"),
        (1, "Three Month"),
        (2, "Six Month"),
        (3, "Twelve Month"),
    ],
}


def _load_env_local() -> None:
    env_local = REPO_ROOT / ".env.local"
    if not env_local.exists():
        return
    for line in env_local.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _resolve_env() -> dict[str, str]:
    for canonical, alias in _ENV_ALIASES.items():
        if alias not in os.environ and canonical in os.environ:
            os.environ[alias] = os.environ[canonical]
    missing = [v for v in _ENV_ALIASES.values() if not os.environ.get(v)]
    if missing:
        print(f"ERROR: missing env vars: {missing}", file=sys.stderr)
        sys.exit(1)
    return {
        "url":    os.environ["DATAVERSE_URL"].rstrip("/"),
        "client": os.environ["DATAVERSE_CLIENT_ID"],
        "secret": os.environ["DATAVERSE_CLIENT_SECRET"],
        "tenant": os.environ["DATAVERSE_TENANT_ID"],
    }


def _get_token(cfg: dict[str, str]) -> str:
    app = msal.ConfidentialClientApplication(
        cfg["client"],
        authority=f"https://login.microsoftonline.com/{cfg['tenant']}",
        client_credential=cfg["secret"],
    )
    result = app.acquire_token_for_client(scopes=[f"{cfg['url']}/.default"])
    if "access_token" not in result:
        print(f"ERROR: token acquisition failed: {result.get('error_description')}", file=sys.stderr)
        sys.exit(1)
    return result["access_token"]


def _patch_option(
    session: requests.Session,
    base_url: str,
    option_set_name: str,
    value: int,
    label: str,
    dry_run: bool,
) -> bool:
    payload = {
        "OptionSetName": option_set_name,
        "Value": value,
        "Label": {
            "LocalizedLabels": [
                {"Label": label, "LanguageCode": 1033}
            ],
        },
        "MergeLabels": True,
    }
    if dry_run:
        print(f"  [dry-run] would patch {option_set_name}[{value}] -> '{label}'")
        return True

    resp = session.post(f"{base_url}/api/data/v9.2/UpdateOptionValue", json=payload)
    if resp.status_code in (200, 204):
        print(f"  OK {option_set_name}[{value}] -> '{label}'")
        return True

    # UpdateOptionValue only RELABELS an existing value. When a value was newly added
    # to the solution XML but not yet present in the target environment (e.g. the
    # solution import has not run), Dataverse returns 404 "Could not find a picklist
    # value". In that case CREATE it via InsertOptionValue so this script is
    # self-sufficient across dev/UAT/prod regardless of import ordering.
    if resp.status_code == 404 or "Could not find a picklist value" in resp.text:
        insert_payload = {
            "OptionSetName": option_set_name,
            "Value": value,
            "Label": {"LocalizedLabels": [{"Label": label, "LanguageCode": 1033}]},
        }
        ins = session.post(f"{base_url}/api/data/v9.2/InsertOptionValue", json=insert_payload)
        if ins.status_code in (200, 204):
            print(f"  OK {option_set_name}[{value}] -> '{label}' (inserted)")
            return True
        print(f"  ERROR (insert): {option_set_name}[{value}] '{label}' -> HTTP {ins.status_code}: {ins.text[:200]}")
        return False

    print(f"  ERROR: {option_set_name}[{value}] '{label}' -> HTTP {resp.status_code}: {resp.text[:200]}")
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch Dataverse option set labels")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without applying")
    args = parser.parse_args()

    _load_env_local()
    cfg = _resolve_env()

    token = _get_token(cfg)
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version":    "4.0",
    })

    errors = 0
    for option_set_name, options in OPTIONSET_PATCHES.items():
        print(f"\nPatching {option_set_name}:")
        for value, label in options:
            ok = _patch_option(session, cfg["url"], option_set_name, value, label, args.dry_run)
            if not ok:
                errors += 1

    if not args.dry_run:
        print("\nPublishing customizations...")
        resp = session.post(f"{cfg['url']}/api/data/v9.2/PublishAllXml")
        if resp.status_code in (200, 204):
            print("OK Published.")
        else:
            print(f"ERROR: publish failed HTTP {resp.status_code}: {resp.text[:200]}")
            errors += 1

    if errors:
        print(f"\n{errors} error(s). Check output above.")
        return 1
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
