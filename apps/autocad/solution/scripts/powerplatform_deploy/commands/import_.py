"""Import command: wraps solution/scripts/import.py via the pp-deploy CLI.

Imports solution/build/EnmaxAutoCADNumbering_unmanaged.zip into the target
Dataverse environment using the PAC CLI.

INVARIANT: the pac call MUST include --async --max-async-wait-time 60.
Without --async, upgrade imports can hold a synchronous WCF channel open
and exceed PAC's 30-minute timeout, causing CI failures.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from powerplatform_deploy import logging as pp_logging
from powerplatform_deploy.config import load_env


def _pac() -> str:
    """Return path to pac CLI; prefers PATH, falls back to dotnet global tools."""
    found = shutil.which("pac")
    if found:
        return found
    candidate = Path.home() / ".dotnet" / "tools" / "pac.exe"
    if candidate.exists():
        return str(candidate)
    print("ERROR: pac CLI not found.", file=sys.stderr)
    sys.exit(1)


def run(environment: str, dry_run: bool, verbose: bool) -> None:
    """Import the packed solution zip into the target Dataverse environment.

    Loads DATAVERSE_* credentials from code-app/.env.<environment>.
    On --dry-run, logs the intended command and returns without executing.

    The pac call uses --async --max-async-wait-time 60 to poll the import job
    rather than holding a synchronous WCF channel open, which avoids the
    30-minute channel timeout during upgrade imports.

    Args:
        environment: Target environment name, e.g. "dev", "uat", "prod".
        dry_run: When True, log the command but do not execute it.
        verbose: When True, emit DEBUG-level log output.
    """
    logger = pp_logging.get_logger(__name__, verbose)
    cfg = load_env(environment)

    repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent
    zip_path = repo_root / "solution" / "build" / "EnmaxAutoCADNumbering_unmanaged.zip"

    # --async polls the import job instead of holding a synchronous WCF channel
    # open; upgrade imports can exceed PAC's 30-minute sync timeout otherwise.
    cmd = [
        _pac(), "solution", "import",
        "--path", str(zip_path),
        "--publish-changes",
        "--activate-plugins",
        "--async",
        "--max-async-wait-time", "60",
    ]

    logger.debug("Environment config loaded for: %s", environment)
    logger.info("import command: %s", " ".join(cmd))

    if dry_run:
        logger.info("[dry-run] Skipping execution.")
        return

    if not zip_path.exists():
        logger.error("ERROR: %s not found. Run `pp-deploy pack` first.", zip_path)
        sys.exit(2)

    env = {**os.environ, **cfg}
    result = subprocess.run(cmd, check=False, env=env)
    if result.returncode != 0:
        logger.error("pac solution import failed with exit code %d", result.returncode)
        sys.exit(result.returncode)
    logger.info("Import complete.")
