"""Seed command: wraps solution/scripts/seed.py via the pp-deploy CLI.

Invokes the standalone seed.py as a subprocess so that 100% of its behaviour
is preserved with zero duplication.  Credentials from load_env() are forwarded
via the subprocess environment.

On --dry-run the seed.py --dry-run flag is passed; seed.py prints payloads
without writing to Dataverse.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from powerplatform_deploy import logging as pp_logging
from powerplatform_deploy.config import load_env


def run(environment: str, dry_run: bool, verbose: bool) -> None:
    """Seed Dataverse master data by delegating to solution/scripts/seed.py.

    Loads DATAVERSE_* credentials from apps/code-app/.env.<environment> and
    passes them through the subprocess environment.  On --dry-run, appends
    ``--dry-run`` to seed.py so it prints payloads without writing.

    Args:
        environment: Target environment name, e.g. "dev", "uat", "prod".
        dry_run: When True, run seed.py with --dry-run (no writes).
        verbose: When True, emit DEBUG-level log output.
    """
    logger = pp_logging.get_logger(__name__, verbose)
    cfg = load_env(environment)

    repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent
    seed_script = repo_root / "solution" / "scripts" / "seed.py"

    cmd = [sys.executable, str(seed_script)]
    if dry_run:
        cmd.append("--dry-run")

    logger.debug("Environment config loaded for: %s", environment)
    logger.info("seed command: %s", " ".join(cmd))

    if dry_run:
        logger.info("[dry-run] Running seed.py in dry-run mode (no writes).")

    env = {**os.environ, **cfg}
    result = subprocess.run(cmd, check=False, env=env)
    if result.returncode != 0:
        logger.error("seed.py failed with exit code %d", result.returncode)
        sys.exit(result.returncode)
    logger.info("Seed complete.")
