"""SharePoint command stub — plan-11 B4.

Intended interface (NOT YET IMPLEMENTED):
    Provision a SharePoint document library for each active Asset-Unit combination
    (one library per active enmax_autocadassetunit row).

    High-level Graph/SP calls:
    1. Query Dataverse for all active enmax_autocadassetunit rows.
    2. For each asset-unit, call the SharePoint REST API (or Microsoft Graph) to
       create a document library named after the asset-unit code under the
       configured SharePoint site collection.
    3. Set appropriate permissions on the library (e.g. site-member read/write).
    4. Write the resulting library URL back onto the asset-unit row's
       enmax_acdnsharepointlibraryurl column via a Dataverse PATCH.

    Required credentials (from load_env):
        DATAVERSE_URL, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_TENANT_ID
    Additional config (to be read from App Configuration table or deploy.profile.yaml):
        SHAREPOINT_SITE_URL — root site collection for the document libraries.

Raises NotImplementedError until plan-11 B4 is implemented.
"""

from __future__ import annotations

from powerplatform_deploy import logging as pp_logging


def run(environment: str, dry_run: bool, verbose: bool) -> None:
    """Provision SharePoint document libraries per active Asset-Unit (STUB).

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
        "sharepoint: would provision one SharePoint document library per active "
        "enmax_autocadassetunit in environment '%s'.",
        environment,
    )
    logger.info(
        "sharepoint: intended steps — (1) query active asset-units from Dataverse, "
        "(2) create/verify SP library per unit via Microsoft Graph, "
        "(3) set permissions, "
        "(4) PATCH enmax_acdnsharepointlibraryurl back onto each asset-unit row.",
    )

    if dry_run:
        logger.info("[dry-run] sharepoint: no-op preview complete. No changes made.")
        return

    raise NotImplementedError(
        "sharepoint command is not yet implemented (plan-11 B4). "
        "Intended interface: provision one SharePoint document library per active "
        "enmax_autocadassetunit via Microsoft Graph / SharePoint REST, then write "
        "the library URL back to enmax_acdnsharepointlibraryurl on each row."
    )
