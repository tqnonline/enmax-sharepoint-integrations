"""Optionsets command: wraps solution/scripts/patch_optionsets.py via the pp-deploy CLI.

Invokes the standalone patch_optionsets.py as a subprocess so that 100% of
its behaviour is preserved with zero duplication.  Credentials from load_env()
are forwarded via the subprocess environment.

On --dry-run the patch_optionsets.py --dry-run flag is passed; it prints
would-be patches without applying them.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from powerplatform_deploy import logging as pp_logging
from powerplatform_deploy.config import load_env


def run(environment: str, dry_run: bool, verbose: bool) -> None:
    """Patch Dataverse option set labels by delegating to patch_optionsets.py.

    Loads DATAVERSE_* credentials from code-app/.env.<environment> and
    passes them through the subprocess environment.  On --dry-run, appends
    ``--dry-run`` to patch_optionsets.py so it prints planned patches without
    applying them.

    Args:
        environment: Target environment name, e.g. "dev", "uat", "prod".
        dry_run: When True, run patch_optionsets.py with --dry-run (no writes).
        verbose: When True, emit DEBUG-level log output.
    """
    logger = pp_logging.get_logger(__name__, verbose)
    cfg = load_env(environment)

    repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent
    script = repo_root / "solution" / "scripts" / "patch_optionsets.py"

    cmd = [sys.executable, str(script)]
    if dry_run:
        cmd.append("--dry-run")

    logger.debug("Environment config loaded for: %s", environment)
    logger.info("optionsets command: %s", " ".join(cmd))

    if dry_run:
        logger.info("[dry-run] Running patch_optionsets.py in dry-run mode (no writes).")

    env = {**os.environ, **cfg}
    result = subprocess.run(cmd, check=False, env=env)
    if result.returncode != 0:
        logger.error("patch_optionsets.py failed with exit code %d", result.returncode)
        sys.exit(result.returncode)
    logger.info("Optionsets patch complete.")
