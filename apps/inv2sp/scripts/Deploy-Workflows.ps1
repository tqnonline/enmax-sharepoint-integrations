#Requires -Version 7.0
<#
.SYNOPSIS
    Zip-deploys the workflows/ folder (host.json, connections.json, and
    every wf-*/workflow.json) to the INV2SP Logic App Standard site.
.DESCRIPTION
    Uses `az logicapp deployment source config-zip`, the dedicated Kudu
    zip-push command for Logic App Standard (confirmed present and
    distinct from the generic `az functionapp`/`az webapp` equivalents in
    this az CLI version - `az logicapp deployment source config-zip`).

    The zip must contain the CONTENTS of workflows/ at its root (host.json
    etc. at the top level, not nested under a "workflows/" folder inside
    the zip) - built via Compress-Archive -Path "workflows/*" rather than
    -Path "workflows", which would nest an extra folder level.
.PARAMETER Environment
    'dev' or 'prod'.
.PARAMETER TimeoutSeconds
    How long to wait for the deployment to report status. Default 300.
.PARAMETER Force
    Skip the interactive confirmation prompt before deploying. Also use
    this instead of relying on `-Confirm:$false` in non-interactive/
    scripted contexts - some PowerShell hosts throw a
    NullReferenceException from $PSCmdlet.ShouldProcess() when no real
    console UI is attached, even with -Confirm:$false passed (confirmed
    empirically, 2026-08-03). -Force avoids calling ShouldProcess at all.
.EXAMPLE
    ./Deploy-Workflows.ps1 -Environment dev
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [int]$TimeoutSeconds = 300,

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'modules/Inv2Sp.Common.psm1') -Force

$config = Get-Inv2SpEnvironmentConfig -Environment $Environment
$repoRoot = Get-Inv2SpRepoRoot
$workflowsDir = Join-Path $repoRoot 'workflows'

if (-not (Test-Path $workflowsDir)) {
    throw "workflows/ directory not found at $workflowsDir"
}

Assert-Inv2SpAzLogin -Environment $Environment | Out-Null

if (-not (Test-Inv2SpActiveRole -Environment $Environment)) {
    throw "No active Contributor/Owner role on $($config.ResourceGroup). Run Invoke-PimActivation.ps1 -Environment $Environment first."
}

# Sanity check every workflow.json is valid JSON before zipping - a bad
# zip deploy is much harder to diagnose than a local JSON parse failure.
$workflowFiles = Get-ChildItem -Path $workflowsDir -Recurse -Filter '*.json'
Write-Inv2SpLog "Validating $($workflowFiles.Count) JSON file(s) before deploy..." -Level Info
foreach ($file in $workflowFiles) {
    try {
        Get-Content -Path $file.FullName -Raw | ConvertFrom-Json | Out-Null
    } catch {
        throw "Invalid JSON in $($file.FullName): $($_.Exception.Message)"
    }
}
Write-Inv2SpLog 'All workflow JSON files are syntactically valid.' -Level Success

$zipPath = Join-Path ([System.IO.Path]::GetTempPath()) "inv2sp-workflows-$Environment-$(Get-Date -Format 'yyyyMMddHHmmss').zip"
try {
    Write-Inv2SpLog "Building deployment zip from $workflowsDir ..." -Level Info
    # Trailing '/*' zips the CONTENTS of workflows/, not the folder itself -
    # Kudu zip-push expects host.json etc. at the zip root.
    Compress-Archive -Path (Join-Path $workflowsDir '*') -DestinationPath $zipPath -Force
    Write-Inv2SpLog "Zip created: $zipPath ($([math]::Round((Get-Item $zipPath).Length / 1KB, 1)) KB)" -Level Info

    if (-not $Force -and -not $PSCmdlet.ShouldProcess($config.LogicAppName, 'Zip-deploy workflows')) {
        Write-Inv2SpLog 'Cancelled - nothing was deployed.' -Level Warn
        exit 0
    }

    Write-Inv2SpLog "Deploying to $($config.LogicAppName)..." -Level Info
    Invoke-Inv2SpAz logicapp deployment source config-zip `
        -g $config.ResourceGroup `
        -n $config.LogicAppName `
        --src $zipPath `
        --timeout $TimeoutSeconds | Out-Null

    Write-Inv2SpLog 'Zip deploy submitted successfully.' -Level Success
} finally {
    if (Test-Path $zipPath) {
        Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    }
}

Write-Inv2SpLog 'Waiting 20s for the runtime to pick up the new workflow content...' -Level Info
Start-Sleep -Seconds 20

Write-Inv2SpLog 'Verifying deployed workflows...' -Level Info
$deployedWorkflows = Invoke-Inv2SpAz rest --method get --url "https://management.azure.com/subscriptions/$($config.SubscriptionId)/resourceGroups/$($config.ResourceGroup)/providers/Microsoft.Web/sites/$($config.LogicAppName)/workflows?api-version=2018-11-01"

$expectedNames = (Get-ChildItem -Path $workflowsDir -Directory).Name
$actualNames = @($deployedWorkflows.value | ForEach-Object { ($_.name -split '/')[-1] })

foreach ($name in $expectedNames) {
    if ($actualNames -contains $name) {
        $wf = $deployedWorkflows.value | Where-Object { ($_.name -split '/')[-1] -eq $name }
        Write-Inv2SpLog "  $name -> flowState=$($wf.properties.flowState), health=$($wf.properties.health.state)" -Level Success
    } else {
        Write-Inv2SpLog "  $name -> NOT FOUND in deployed workflows list yet (may still be propagating)" -Level Warn
    }
}
