"""pp-deploy CLI entry point.

Usage:
    pp-deploy --help
    pp-deploy pack --environment dev
    pp-deploy import --environment dev --dry-run
    pp-deploy export --environment dev --verbose
    pp-deploy roles --environment dev --dry-run
    pp-deploy seed --environment dev --dry-run
    pp-deploy optionsets --environment dev --dry-run
    pp-deploy schema --environment dev --dry-run
    pp-deploy extract --environment dev [--workbook <path>] [--dry-run]
    pp-deploy sharepoint --environment dev --dry-run
    pp-deploy flows --environment dev --dry-run
"""

from __future__ import annotations

from typing import Annotated, Optional

import typer

from powerplatform_deploy.commands import export, import_, pack

app = typer.Typer(
    name="pp-deploy",
    help="Power Platform deploy tooling for the Enmax AutoCAD solution.",
    add_completion=False,
)

# ---------------------------------------------------------------------------
# Shared option types
# ---------------------------------------------------------------------------

EnvironmentArg = Annotated[
    str,
    typer.Option("--environment", "-e", help="Target environment (e.g. dev, uat, prod).", prompt=False),
]
DryRunArg = Annotated[
    bool,
    typer.Option("--dry-run/--no-dry-run", help="Log the intended command but do not execute it."),
]
VerboseArg = Annotated[
    bool,
    typer.Option("--verbose/--no-verbose", "-v/-V", help="Emit DEBUG-level log output."),
]


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------

@app.command()
def pack(
    environment: EnvironmentArg,
    dry_run: DryRunArg = False,
    verbose: VerboseArg = False,
) -> None:
    """Pack solution/src/ into solution/build/EnmaxAutoCADNumbering_unmanaged.zip.

    Uses `pac solution pack`. Run before import to build the solution artifact.
    """
    from powerplatform_deploy.commands import pack as pack_mod
    pack_mod.run(environment=environment, dry_run=dry_run, verbose=verbose)


@app.command(name="import")
def import_cmd(
    environment: EnvironmentArg,
    dry_run: DryRunArg = False,
    verbose: VerboseArg = False,
) -> None:
    """Import the packed solution zip into the target Dataverse environment.

    Uses `pac solution import --publish-changes --activate-plugins --async
    --max-async-wait-time 60`. The --async flag is required to avoid a 30-minute
    channel timeout during upgrade imports.
    """
    from powerplatform_deploy.commands import import_ as import_mod
    import_mod.run(environment=environment, dry_run=dry_run, verbose=verbose)


@app.command()
def export(
    environment: EnvironmentArg,
    dry_run: DryRunArg = False,
    verbose: VerboseArg = False,
) -> None:
    """Export the unmanaged solution from the environment and unpack to solution/src/.

    Two-step: `pac solution export` then `pac solution unpack`. Run after every
    maker-UI schema change to produce the XML diff that goes into the PR.
    """
    from powerplatform_deploy.commands import export as export_mod
    export_mod.run(environment=environment, dry_run=dry_run, verbose=verbose)


@app.command()
def roles(
    environment: EnvironmentArg,
    dry_run: DryRunArg = False,
    verbose: VerboseArg = False,
) -> None:
    """Provision Dataverse security roles from seed/security_roles.yaml.

    Reads role definitions + BU name from the seed file.  Idempotent: existing
    roles are updated in-place via ReplacePrivilegesRole (bound action).
    Run after solution import and seed.
    """
    from powerplatform_deploy.commands import roles as roles_mod
    roles_mod.run(environment=environment, dry_run=dry_run, verbose=verbose)


@app.command()
def seed(
    environment: EnvironmentArg,
    dry_run: DryRunArg = False,
    verbose: VerboseArg = False,
    scope: Annotated[
        str,
        typer.Option("--scope", help="Seed scope: master (reference+app_config, default), demo (sample), sequences (init-once), all (master+demo)."),
    ] = "master",
) -> None:
    """Seed Dataverse data from solution/seed/ YAML files.

    Master data (reference + app_config) seeds to every environment; demo/
    transaction data (sample) is dev-only; number_sequences is init-once.
    Delegates to solution/scripts/seed.py. On --dry-run, prints PATCH payloads
    without writing to Dataverse.
    """
    from powerplatform_deploy.commands import seed as seed_mod
    seed_mod.run(environment=environment, dry_run=dry_run, verbose=verbose, scope=scope)


@app.command()
def optionsets(
    environment: EnvironmentArg,
    dry_run: DryRunArg = False,
    verbose: VerboseArg = False,
) -> None:
    """Patch Dataverse global option set labels to match the solution XML definitions.

    Delegates to solution/scripts/patch_optionsets.py.  On --dry-run, prints
    planned patches without applying them.
    """
    from powerplatform_deploy.commands import optionsets as optionsets_mod
    optionsets_mod.run(environment=environment, dry_run=dry_run, verbose=verbose)


@app.command()
def schema(
    environment: EnvironmentArg,
    dry_run: DryRunArg = False,
    verbose: VerboseArg = False,
) -> None:
    """Provision Dataverse schema (tables, columns, relationships, option sets).

    Delegates to solution/scripts/provision_schema.py.  Idempotent: safe to
    re-run.  On --dry-run, prints intended operations without writing to Dataverse.
    """
    from powerplatform_deploy.commands import schema as schema_mod
    schema_mod.run(environment=environment, dry_run=dry_run, verbose=verbose)


@app.command()
def extract(
    environment: EnvironmentArg,
    dry_run: DryRunArg = False,
    verbose: VerboseArg = False,
    workbook: Annotated[
        Optional[str],
        typer.Option("--workbook", help="Path to the Excel workbook (default: Master data.xlsx)."),
    ] = None,
) -> None:
    """Extract master/reference data from Excel to YAML seed files (offline).

    Delegates to solution/scripts/extract_master_data.py.  No Dataverse
    credentials are required — this is a pure local transform (Excel -> YAML).
    The --environment option is accepted for CLI surface consistency but unused.
    On --dry-run, logs the intended command without mutating any seed files.
    """
    from powerplatform_deploy.commands import extract as extract_mod
    extract_mod.run(environment=environment, dry_run=dry_run, verbose=verbose, workbook=workbook)


@app.command()
def sharepoint(
    environment: EnvironmentArg,
    dry_run: DryRunArg = False,
    verbose: VerboseArg = False,
) -> None:
    """Provision SharePoint document libraries per active Asset-Unit (STUB).

    NOT YET IMPLEMENTED (plan-11 B4).  On --dry-run, logs the intended plan.
    On a real run, raises NotImplementedError with interface documentation.
    """
    from powerplatform_deploy.commands import sharepoint as sharepoint_mod
    sharepoint_mod.run(environment=environment, dry_run=dry_run, verbose=verbose)


@app.command()
def flows(
    environment: EnvironmentArg,
    dry_run: DryRunArg = False,
    verbose: VerboseArg = False,
) -> None:
    """Enable and wire Power Automate flows in the imported solution (STUB).

    NOT YET IMPLEMENTED.  On --dry-run, logs the intended plan.
    On a real run, raises NotImplementedError with interface documentation.
    """
    from powerplatform_deploy.commands import flows as flows_mod
    flows_mod.run(environment=environment, dry_run=dry_run, verbose=verbose)


if __name__ == "__main__":
    app()
