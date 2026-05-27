"""Pack command: wraps solution/scripts/pack.py via the pp-deploy CLI.

Packs solution/src/ into solution/build/EnmaxAutoCADNumbering_unmanaged.zip
using the PAC CLI (`pac solution pack`).
"""

from __future__ import annotations

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
    """Pack solution/src/ into the build zip using the PAC CLI.

    Loads DATAVERSE_* credentials from apps/code-app/.env.<environment> and
    makes them available as environment variables for the subprocess call.
    On --dry-run, logs the intended command and returns without executing.

    Args:
        environment: Target environment name, e.g. "dev", "uat", "prod".
        dry_run: When True, log the command but do not execute it.
        verbose: When True, emit DEBUG-level log output.
    """
    logger = pp_logging.get_logger(__name__, verbose)
    cfg = load_env(environment)

    repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent
    src = repo_root / "solution" / "src"
    build = repo_root / "solution" / "build"
    zip_path = build / "EnmaxAutoCADNumbering_unmanaged.zip"

    cmd = [
        _pac(), "solution", "pack",
        "--folder", str(src),
        "--zipfile", str(zip_path),
        "--packagetype", "Unmanaged",
    ]

    logger.debug("Environment config loaded for: %s", environment)
    logger.info("pack command: %s", " ".join(cmd))

    if dry_run:
        logger.info("[dry-run] Skipping execution.")
        return

    build.mkdir(exist_ok=True)

    import os
    env = {**os.environ, **cfg}
    result = subprocess.run(cmd, check=False, env=env)
    if result.returncode != 0:
        logger.error("pac solution pack failed with exit code %d", result.returncode)
        sys.exit(result.returncode)
    logger.info("Pack complete: %s", zip_path)
