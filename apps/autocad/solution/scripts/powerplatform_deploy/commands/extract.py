"""Extract command: wraps solution/scripts/extract_master_data.py via the pp-deploy CLI.

Invokes the standalone extract_master_data.py as a subprocess so that 100% of its
behaviour is preserved with zero duplication.

This command is OFFLINE — it is a pure local transform (Excel -> YAML via openpyxl)
that does NOT connect to Dataverse and requires no credentials.  For that reason,
load_env() is NOT called here: requiring a .env file would wrongly fail an operation
that has no network dependency.  The --environment option is accepted on the CLI
surface for consistency with other subcommands but is otherwise unused.

On --dry-run the wrapper logs the intended command and returns WITHOUT running the
subprocess, because extract_master_data.py has no dry-run mode of its own and would
write YAML seed files on every run.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

from powerplatform_deploy import logging as pp_logging


def run(
    environment: str,
    dry_run: bool,
    verbose: bool,
    workbook: Optional[str] = None,
) -> None:
    """Extract master data from Master data.xlsx to YAML seed files.

    Delegates to solution/scripts/extract_master_data.py.  No Dataverse
    credentials are needed — this is a pure local transform.

    The ``environment`` argument is accepted for CLI surface consistency but is
    unused; load_env() is intentionally NOT called.

    On --dry-run, logs the intended command and returns without executing it so
    that seed files are never mutated during a dry-run.

    Args:
        environment: Unused. Accepted for CLI surface consistency only.
        dry_run: When True, log the intended command but do not run it.
        verbose: When True, emit DEBUG-level log output.
        workbook: Optional path to the Excel workbook.  When provided, passed to
                  extract_master_data.py as ``--workbook <path>``.
    """
    logger = pp_logging.get_logger(__name__, verbose)

    repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent
    script = repo_root / "solution" / "scripts" / "extract_master_data.py"

    cmd = [sys.executable, str(script)]
    if workbook is not None:
        cmd.extend(["--workbook", workbook])

    logger.debug("environment arg '%s' is unused by extract (offline command).", environment)
    logger.info("extract command: %s", " ".join(cmd))

    if dry_run:
        logger.info("[dry-run] would extract master data; skipping to avoid mutating seed files.")
        return

    result = subprocess.run(cmd, check=False, env=os.environ.copy())
    if result.returncode != 0:
        logger.error("extract_master_data.py failed with exit code %d", result.returncode)
        sys.exit(result.returncode)
    logger.info("Master data extraction complete.")
