#!/usr/bin/env python3
"""Sync AdminTeamId / ApproverTeamId App Configuration from AdminTeamName / ApproverTeamName.

Run after teams exist in Dataverse (team-enmax-autocad-admins, team-enmax-autocad-approvers).
Idempotent — safe to re-run.

Usage (from repo root, user auth):
  python3 solution/scripts/sync_team_app_config.py --auth azcli --url https://org.crm3.dynamics.com

Or with env vars from CI:
  DATAVERSE_URL=... DATAVERSE_ACCESS_TOKEN=... python3 solution/scripts/sync_team_app_config.py
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from powerplatform_deploy.client import DataverseClient  # noqa: E402
from powerplatform_deploy.commands.roles import sync_team_app_config  # noqa: E402
from powerplatform_deploy import logging as pp_logging  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Admin/Approver team GUIDs into App Configuration")
    parser.add_argument("--url", default=os.environ.get("DATAVERSE_URL"), help="Dataverse org URL")
    parser.add_argument("--auth", choices=["azcli", "device", "interactive"], default="azcli")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    logger = pp_logging.get_logger(__name__, args.verbose)

    url = (args.url or "").rstrip("/")
    if not url:
        print("ERROR: pass --url or set DATAVERSE_URL", file=sys.stderr)
        sys.exit(1)

    token = os.environ.get("DATAVERSE_ACCESS_TOKEN")
    if not token:
        token_script = REPO_ROOT / "solution" / "scripts" / "get_dataverse_token.py"
        import subprocess
        result = subprocess.run(
            [sys.executable, str(token_script), "--auth", args.auth, "--url", url],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            print(result.stderr or result.stdout, file=sys.stderr)
            sys.exit(result.returncode)
        token = result.stdout.strip().splitlines()[-1]

    client = DataverseClient(url, token)
    logger.info("Syncing team ids for %s", url)
    sync_team_app_config(client, logger)
    logger.info("Done.")


if __name__ == "__main__":
    main()
