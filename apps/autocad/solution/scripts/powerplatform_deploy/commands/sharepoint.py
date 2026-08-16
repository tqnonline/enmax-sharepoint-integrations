"""SharePoint command stub — plan-11 B4.

Intended interface (NOT YET IMPLEMENTED):
    Provision SharePoint document libraries per taxonomy segment (e.g. per asset
    code) under the configured Drawings/Documents site collections.

    High-level Graph/SP calls:
    1. Query Dataverse for active taxonomy reference rows (or read URLs from App Config).
    2. For each target segment, call SharePoint REST / Microsoft Graph to create or
       verify the document library under the configured site collection.
    3. Set appropriate permissions on the library (e.g. site-member read/write).
    4. Write the resulting library URL back via Dataverse PATCH where applicable.

    Required credentials (from load_env):
        DATAVERSE_URL, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_TENANT_ID
    Additional config (to be read from App Configuration table or deploy.profile.yaml):
        SHAREPOINT_SITE_URL — root site collection for the document libraries.

Raises NotImplementedError until plan-11 B4 is implemented.
"""

from __future__ import annotations

from powerplatform_deploy import logging as pp_logging


def run(environment: str, dry_run: bool, verbose: bool) -> None:
    """Provision SharePoint document libraries per taxonomy segment (STUB).

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
        "sharepoint: would provision SharePoint document libraries for environment '%s'.",
        environment,
    )
    logger.info(
        "sharepoint: intended steps — (1) resolve target segments from App Config / "
        "reference data, (2) create/verify SP libraries via Microsoft Graph, "
        "(3) set permissions, (4) PATCH library URLs back to Dataverse where needed.",
    )

    if dry_run:
        logger.info("[dry-run] sharepoint: no-op preview complete. No changes made.")
        return

    raise NotImplementedError(
        "sharepoint command is not yet implemented (plan-11 B4). "
        "Intended interface: provision SharePoint document libraries per taxonomy "
        "segment via Microsoft Graph / SharePoint REST, then write URLs back to Dataverse."
    )
