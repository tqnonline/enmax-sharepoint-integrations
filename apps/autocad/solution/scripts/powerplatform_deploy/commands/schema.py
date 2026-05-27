"""Schema command: wraps solution/scripts/provision_schema.py via the pp-deploy CLI.

Invokes the standalone provision_schema.py as a subprocess so that 100% of its
behaviour is preserved with zero duplication.  Credentials from load_env() are
forwarded via the subprocess environment.

On --dry-run the provision_schema.py --dry-run flag is passed; provision_schema.py
prints the intended operations without writing to Dataverse.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from powerplatform_deploy import logging as pp_logging
from powerplatform_deploy.config import load_env


def run(environment: str, dry_run: bool, verbose: bool) -> None:
    """Provision Dataverse schema by delegating to solution/scripts/provision_schema.py.

    Loads DATAVERSE_* credentials from apps/code-app/.env.<environment> and
    passes them through the subprocess environment.  On --dry-run, appends
    ``--dry-run`` to provision_schema.py so it prints intended operations without
    writing to Dataverse.

    Args:
        environment: Target environment name, e.g. "dev", "uat", "prod".
        dry_run: When True, run provision_schema.py with --dry-run (no writes).
        verbose: When True, emit DEBUG-level log output.
    """
    logger = pp_logging.get_logger(__name__, verbose)
    cfg = load_env(environment)

    repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent
    script = repo_root / "solution" / "scripts" / "provision_schema.py"

    cmd = [sys.executable, str(script)]
    if dry_run:
        cmd.append("--dry-run")

    logger.debug("Environment config loaded for: %s", environment)
    logger.info("schema command: %s", " ".join(cmd))

    if dry_run:
        logger.info("[dry-run] Running provision_schema.py in dry-run mode (no writes).")

    env = {**os.environ, **cfg}
    result = subprocess.run(cmd, check=False, env=env)
    if result.returncode != 0:
        logger.error("provision_schema.py failed with exit code %d", result.returncode)
        sys.exit(result.returncode)
    logger.info("Schema provisioning complete.")
