"""Flows command stub.

Intended interface (NOT YET IMPLEMENTED):
    Enable the Power Automate flows that ship inside the imported solution and
    wire their connection references per environment.

    The solution import (pp-deploy import) brings the flow DEFINITIONS into the
    environment in a disabled/draft state.  This command would activate them and
    bind connection references so the flows run correctly per environment.

    High-level pac / Graph calls:
    1. Enumerate flows inside enmax_autocadsln via pac or the Power Automate
       Management API (list-flows-as-admin / Power Platform REST).
    2. For each flow, update connection references to point to the
       environment-specific connections (read from deploy.profile.yaml or
       App Configuration table).
    3. Enable / turn on each flow (PATCH statecode=1, statuscode=2 on the
       workflow Dataverse entity, or via Power Automate Management API).
    4. Confirm each flow is in the Running state before returning.

    Required credentials (from load_env):
        DATAVERSE_URL, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_TENANT_ID
    Additional config (to be read from deploy.profile.yaml or App Configuration table):
        connection_references in deploy.profile.yaml — logical names already in DEV:
          enmax_autocadconrefDataverse, enmax_autocadconrefOutlook,
          enmax_autocadconrefSharePoint (see connection_references block).
        Per-flow workflow.json under solution/src/Workflows/*/ maps connector keys
        to those logical names via build_workflow_clientdata.py.

Raises NotImplementedError until this command is implemented.
"""

from __future__ import annotations

from powerplatform_deploy import logging as pp_logging


def run(environment: str, dry_run: bool, verbose: bool) -> None:
    """Enable and wire Power Automate flows in the imported solution (STUB).

    On --dry-run, logs the intended plan and returns without raising.
    On a real run, raises NotImplementedError with a description of the
    intended interface so callers receive a clear signal, not a silent no-op.

    Args:
        environment: Target environment name, e.g. "dev", "uat", "prod".
        dry_run: When True, log the intended plan and return (no error raised).
        verbose: When True, emit DEBUG-level log output.
    """
    logger = pp_logging.get_logger(__name__, verbose)

    if not environment:
        raise ValueError("environment must be a non-empty string.")

    logger.info(
        "flows: would enable and wire connection references for all Power Automate "
        "flows in enmax_autocadsln in environment '%s'.",
        environment,
    )
    logger.info(
        "flows: intended steps — (1) enumerate solution flows via pac/Power Platform REST, "
        "(2) update connection references per environment config, "
        "(3) turn on each flow, "
        "(4) verify Running state.",
    )

    if dry_run:
        logger.info("[dry-run] flows: no-op preview complete. No changes made.")
        return

    raise NotImplementedError(
        "flows command is not yet implemented. "
        "Intended interface: enable and wire connection references for all Power Automate "
        "flows shipped inside enmax_autocadsln after solution import, using "
        "pac CLI and/or Power Platform Management REST API."
    )
