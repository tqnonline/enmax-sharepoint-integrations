#!/usr/bin/env python3
"""Write apps/code-app/power.config.json for pac code push (user-auth deploy).

Usage:
    APP_ID=<guid> ENVIRONMENT_ID=<guid> python solution/scripts/write_power_config.py
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

_GUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUT = REPO_ROOT / "apps" / "code-app" / "power.config.json"

DATA_SOURCES = {
    "enmax_autocadappconfigs": {"entitySetName": "enmax_autocadappconfigs", "logicalName": "enmax_autocadappconfig", "isHidden": False},
    "enmax_autocadreservations": {"entitySetName": "enmax_autocadreservations", "logicalName": "enmax_autocadreservation", "isHidden": False},
    "enmax_autocaddrawings": {"entitySetName": "enmax_autocaddrawings", "logicalName": "enmax_autocaddrawing", "isHidden": False},
    "enmax_autocadsheets": {"entitySetName": "enmax_autocadsheets", "logicalName": "enmax_autocadsheet", "isHidden": False},
    "enmax_autocadcheckouts": {"entitySetName": "enmax_autocadcheckouts", "logicalName": "enmax_autocadcheckout", "isHidden": False},
    "enmax_autocadbusinesses": {"entitySetName": "enmax_autocadbusinesses", "logicalName": "enmax_autocadbusiness", "isHidden": False},
    "enmax_autocadassets": {"entitySetName": "enmax_autocadassets", "logicalName": "enmax_autocadasset", "isHidden": False},
    "enmax_autocadunits": {"entitySetName": "enmax_autocadunits", "logicalName": "enmax_autocadunit", "isHidden": False},
    "enmax_autocaddomains": {"entitySetName": "enmax_autocaddomains", "logicalName": "enmax_autocaddomain", "isHidden": False},
    "enmax_autocadsystems": {"entitySetName": "enmax_autocadsystems", "logicalName": "enmax_autocadsystem", "isHidden": False},
    "enmax_autocadkinds": {"entitySetName": "enmax_autocadkinds", "logicalName": "enmax_autocadkind", "isHidden": False},
    "enmax_autocadsystemscopes": {"entitySetName": "enmax_autocadsystemscopes", "logicalName": "enmax_autocadsystemscope", "isHidden": False},
    "enmax_autocadnumbersequences": {"entitySetName": "enmax_autocadnumbersequences", "logicalName": "enmax_autocadnumbersequence", "isHidden": False},
    "enmax_autocadauditevents": {"entitySetName": "enmax_autocadauditevents", "logicalName": "enmax_autocadauditevent", "isHidden": False},
    "enmax_autocadrecordtypes": {"entitySetName": "enmax_autocadrecordtypes", "logicalName": "enmax_autocadrecordtype", "isHidden": False},
    "enmax_autocadrecordphases": {"entitySetName": "enmax_autocadrecordphases", "logicalName": "enmax_autocadrecordphase", "isHidden": False},
    "enmax_autocadvendors": {"entitySetName": "enmax_autocadvendors", "logicalName": "enmax_autocadvendor", "isHidden": False},
    "enmax_autocadbroadcasts": {"entitySetName": "enmax_autocadbroadcasts", "logicalName": "enmax_autocadbroadcast", "isHidden": False},
    "enmax_autocadbroadcastdismissals": {"entitySetName": "enmax_autocadbroadcastdismissals", "logicalName": "enmax_autocadbroadcastdismissal", "isHidden": False},
    "enmax_autocaduserpreferences": {"entitySetName": "enmax_autocaduserpreferences", "logicalName": "enmax_autocaduserpreference", "isHidden": False},
    "enmax_autocadinappnotifications": {"entitySetName": "enmax_autocadinappnotifications", "logicalName": "enmax_autocadinappnotification", "isHidden": False},
    "teams": {"entitySetName": "teams", "logicalName": "team", "isHidden": False},
    "systemusers": {"entitySetName": "systemusers", "logicalName": "systemuser", "isHidden": False},
}


def main() -> int:
    app_id = os.environ.get("APP_ID", "").strip().splitlines()[-1].strip()
    env_id = os.environ.get("ENVIRONMENT_ID", "").strip()
    if not app_id or not env_id:
        print("ERROR: set APP_ID and ENVIRONMENT_ID env vars.", file=sys.stderr)
        return 1
    if not _GUID_RE.match(app_id):
        print(
            f"ERROR: APP_ID is not a valid GUID (got {app_id!r}). "
            "Re-run discover_code_app.py or set APP_ID from maker portal.",
            file=sys.stderr,
        )
        return 1

    cfg = {
        "version": "1.0",
        "appId": app_id,
        "appDisplayName": os.environ.get("APP_DISPLAY_NAME", "EEC Generation Document Management system"),
        "region": "prod",
        "environmentId": env_id,
        "description": " ",
        "buildPath": "./dist",
        "buildEntryPoint": "index.html",
        "localAppUrl": "http://localhost:3000",
        "logoPath": "Default",
        "connectionReferences": {},
        "databaseReferences": {
            "default.cds": {
                "dataSources": DATA_SOURCES,
                "environmentVariableName": "",
            }
        },
    }
    OUT.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
