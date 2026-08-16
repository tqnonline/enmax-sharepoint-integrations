function Invoke-PpDeployFlows {
    <#
    .SYNOPSIS
      Deploy Power Automate flows from a flow catalog into their target Dataverse solution.

    .DESCRIPTION
      Thin wrapper around solution/scripts/deploy_flows.py.

      -Catalog selects which flow_catalog*.yaml drives the run and, via
      deploy_flows.py's own --catalog → --solution defaulting, which solution the
      flows land in: 'prod' (default) deploys flow_catalog.yaml into
      enmax_autocadsln; 'admin' deploys flow_catalog_admin.yaml (the UAT harness
      flows) into enmax_autocadadminsln. Folders on disk outside the selected
      catalog are never touched — see ADR 0005.

      Credentials are read from the process environment (DATAVERSE_URL plus
      whichever DATAVERSE_CLIENT_* vars the resolved -Auth mode needs), matching
      Register-PpPlugins / deploy_flows.py's own auth resolution. Callers (e.g.
      Invoke-PpDeploy) are expected to have already exported DATAVERSE_* via
      Get-PpEnvConfig.

    .PARAMETER Environment
      Target environment name, e.g. 'dev', 'uat', 'prod'. Used for logging only —
      deploy_flows.py itself reads DATAVERSE_URL from the process environment.

    .PARAMETER Catalog
      Which flow catalog to deploy: 'prod' or 'admin'. Default: 'prod'.

    .PARAMETER Solution
      Override the target solution unique name. Default: derived from -Catalog by
      deploy_flows.py itself (enmax_autocadsln for prod, enmax_autocadadminsln for admin).

    .PARAMETER Activate
      Turn flows On after upsert. Default: leave Off/draft.

    .PARAMETER DryRun
      Preview only — passes --dry-run to deploy_flows.py. Also engaged automatically
      when -WhatIf is passed (SupportsShouldProcess).

    .PARAMETER Auth
      Python auth mode: spn | device | azcli | interactive. When omitted, resolves to
      'spn' if DATAVERSE_CLIENT_SECRET is set in the environment, else 'azcli' — the
      same precedence used elsewhere in this module (e.g. Register-PpPlugins).

    .EXAMPLE
      Invoke-PpDeployFlows -Environment prod -Catalog prod -Activate

      Deploys and activates the 11 production flows into enmax_autocadsln.

    .EXAMPLE
      Invoke-PpDeployFlows -Environment uat -Catalog admin -Activate

      Deploys and activates the 3 UAT harness flows into enmax_autocadadminsln.

    .EXAMPLE
      Invoke-PpDeployFlows -Environment dev -Catalog prod -WhatIf

      Dry-runs the prod flow deploy — no Dataverse writes.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)]
        [string]$Environment,

        [ValidateSet('prod', 'admin')]
        [string]$Catalog = 'prod',

        [string]$Solution,

        [switch]$Activate,

        [switch]$DryRun,

        [ValidateSet('spn', 'device', 'azcli', 'interactive')]
        [string]$Auth
    )

    $moduleRoot = Split-Path $PSScriptRoot -Parent
    $repoRoot   = Split-Path (Split-Path $moduleRoot -Parent) -Parent
    $script     = Join-Path $repoRoot 'solution/scripts/deploy_flows.py'

    $resolvedAuth = if ($Auth) { $Auth } elseif ($env:DATAVERSE_CLIENT_SECRET) { 'spn' } else { 'azcli' }

    $cliArgs = @('--catalog', $Catalog, '--auth', $resolvedAuth)
    if ($Solution) { $cliArgs += @('--solution', $Solution) }
    if ($Activate) { $cliArgs += '--activate' }
    if ($DryRun -or $WhatIfPreference) { $cliArgs += '--dry-run' }

    if ($PSCmdlet.ShouldProcess($Environment, "Deploy '$Catalog' flow catalog")) {
        Write-PpLog "Deploying '$Catalog' flows to $Environment (auth=$resolvedAuth)..."
        Invoke-PpPythonScript -ScriptPath $script -Arguments $cliArgs
        Assert-PpExitCode -Operation "deploy_flows.py --catalog $Catalog"
    }
}
