function Invoke-PpCli {
    <#
    .SYNOPSIS
      Thin, mockable wrapper that runs a pp-deploy Python CLI subcommand.

    .DESCRIPTION
      Resolves the CLI entry point: if the `pp-deploy` command is on PATH it is used
      directly; otherwise falls back to `python -m powerplatform_deploy.cli`.
      Passes `--environment <Environment>` to every subcommand. Passes `--dry-run` when
      -DryRun is specified so the Python side previews without mutating Dataverse.
      After the process exits, calls Assert-PpExitCode so any non-zero exit surfaces as
      a terminating error (Rule 12: Fail loud).

      This function is the single seam that Pester mocks to verify all Python CLI
      invocations without running real Python processes.

    .PARAMETER Command
      The pp-deploy subcommand to run, e.g. 'pack', 'import', 'optionsets', 'seed', 'roles'.

    .PARAMETER Environment
      The target environment name, e.g. 'dev', 'uat'. Passed as --environment <value>.

    .PARAMETER DryRun
      When set, appends --dry-run to the CLI invocation so the Python script previews
      actions without making real changes.

    .PARAMETER VerboseCli
      When set, appends --verbose to the CLI invocation for additional Python-side output.

    .EXAMPLE
      Invoke-PpCli -Command pack -Environment dev

      Runs: pp-deploy pack --environment dev

    .EXAMPLE
      Invoke-PpCli -Command seed -Environment uat -DryRun

      Runs: pp-deploy seed --environment uat --dry-run
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Command,

        [Parameter(Mandatory)]
        [string]$Environment,

        [switch]$DryRun,

        [switch]$VerboseCli
    )

    # Resolve entry point: prefer installed pp-deploy entry point, fall back to module invocation
    $cliExe = if (Get-Command 'pp-deploy' -ErrorAction SilentlyContinue) {
        'pp-deploy'
    } else {
        'python'
    }

    # Build argument list
    $cliArgs = if ($cliExe -eq 'python') {
        @('-m', 'powerplatform_deploy.cli', $Command, '--environment', $Environment)
    } else {
        @($Command, '--environment', $Environment)
    }

    if ($DryRun)     { $cliArgs += '--dry-run' }
    if ($VerboseCli) { $cliArgs += '--verbose' }

    Write-PpLog "Running: $cliExe $($cliArgs -join ' ')"
    & $cliExe @cliArgs
    Assert-PpExitCode -Operation "pp-deploy $Command"
}
