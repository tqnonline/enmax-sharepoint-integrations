#!/usr/bin/env python3
"""Discover the Code App GUID in the current Dataverse environment (user auth).

Usage:
    export DATAVERSE_URL=https://org.crm.dynamics.com/
    python solution/scripts/discover_code_app.py --auth device
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import _load_env_local, _require_env, acquire_token  # noqa: E402

DISPLAY_NAME_HINTS = (
    "Enmax AutoCAD",
    "EEC Generation",
    "Document Numbering",
)


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }


def discover(base: str, token: str) -> dict[str, str] | None:
    """Return {app_id, name} for the best-matching canvas/code app, or None."""
    url = (
        f"{base.rstrip('/')}/api/data/v9.2/canvasapps"
        f"?$select=canvasappid,name,displayname"
        f"&$filter=contains(name,'enmax') or contains(displayname,'Enmax')"
    )
    resp = requests.get(url, headers=_headers(token), timeout=60)
    if resp.status_code != 200:
        print(f"ERROR: canvasapps query → {resp.status_code}: {resp.text[:400]}", file=sys.stderr)
        return None

    apps = resp.json().get("value", [])
    if not apps:
        return None

    def score(row: dict) -> int:
        text = f"{row.get('name','')} {row.get('displayname','')}".lower()
        return sum(1 for hint in DISPLAY_NAME_HINTS if hint.lower() in text)

    best = sorted(apps, key=score, reverse=True)[0]
    return {
        "app_id": best["canvasappid"],
        "name": best.get("displayname") or best.get("name") or "",
    }


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser(description="Discover Code App id via user auth")
    parser.add_argument("--auth", choices=["device", "interactive", "azcli"], default="device")
    parser.add_argument("--url", default="")
    parser.add_argument("--json", action="store_true", help="Emit JSON {app_id, name}")
    args = parser.parse_args()

    url = (args.url or os.environ.get("DATAVERSE_URL", "")).strip() or _require_env("DATAVERSE_URL")
    token = acquire_token(url.rstrip("/"), args.auth)
    found = discover(url, token)
    if not found:
        print("ERROR: no matching canvas app found. Set APP_ID manually from maker portal.", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(found))
    else:
        print(found["app_id"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
