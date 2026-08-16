"""Export command: wraps solution/scripts/export.py via the pp-deploy CLI.

Exports the unmanaged solution from the connected environment and unpacks it
into solution/src/ using the PAC CLI. Run after every maker-UI schema change
to produce the XML diff that goes into the PR.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from powerplatform_deploy import logging as pp_logging
from powerplatform_deploy.config import load_env

SOLUTION_NAME = "enmax_autocadsln"


def _pac() -> str:
    """Return path to pac CLI; prefers PATH, falls back to dotnet global tools."""
    found = shutil.which("pac")
    if found:
        return found
    candidate = Path.home() / ".dotnet" / "tools" / "pac.exe"
    if candidate.exists():
        return str(candidate)
    print("ERROR: pac CLI not found. Install: dotnet tool install --global Microsoft.PowerApps.CLI.Tool", file=sys.stderr)
    sys.exit(1)


def run(environment: str, dry_run: bool, verbose: bool) -> None:
    """Export the unmanaged solution from dev tenant and unpack to solution/src/.

    Loads DATAVERSE_* credentials from code-app/.env.<environment>.
    On --dry-run, logs both intended commands and returns without executing.

    Two-step process:
    1. pac solution export — downloads the solution zip from the environment.
    2. pac solution unpack — expands the zip into solution/src/ as XML files.

    Args:
        environment: Target environment name, e.g. "dev", "uat", "prod".
        dry_run: When True, log the commands but do not execute them.
        verbose: When True, emit DEBUG-level log output.
    """
    logger = pp_logging.get_logger(__name__, verbose)
    cfg = load_env(environment)

    repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent
    build = repo_root / "solution" / "build"
    src = repo_root / "solution" / "src"
    zip_path = build / "EnmaxAutoCADNumbering_unmanaged.zip"

    export_cmd = [
        _pac(), "solution", "export",
        "--path", str(zip_path),
        "--name", SOLUTION_NAME,
        "--managed", "false",
        "--overwrite",
    ]
    unpack_cmd = [
        _pac(), "solution", "unpack",
        "--zipfile", str(zip_path),
        "--folder", str(src),
        "--packagetype", "Unmanaged",
        "--allowDelete", "true",
    ]

    logger.debug("Environment config loaded for: %s", environment)
    logger.info("export command: %s", " ".join(export_cmd))
    logger.info("unpack command: %s", " ".join(unpack_cmd))

    if dry_run:
        logger.info("[dry-run] Skipping execution.")
        return

    build.mkdir(exist_ok=True)

    env = {**os.environ, **cfg}

    r = subprocess.run(export_cmd, check=False, env=env)
    if r.returncode != 0:
        logger.error("pac solution export failed with exit code %d", r.returncode)
        sys.exit(r.returncode)

    r = subprocess.run(unpack_cmd, check=False, env=env)
    if r.returncode != 0:
        logger.error("pac solution unpack failed with exit code %d", r.returncode)
        sys.exit(r.returncode)

    logger.info("Solution unpacked to %s. Review `git diff solution/src/` before committing.", src)
