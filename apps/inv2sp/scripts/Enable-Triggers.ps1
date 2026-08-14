#Requires -Version 7.0
<#
.SYNOPSIS
    Flips the app-setting kill-switch gate that lets wf-scheduled-copy
    actually invoke the engine - the controlled go-live step (decision:
    production ships with this gate off; enable only after validation).
.DESCRIPTION
    Sets SCHEDULED_TRIGGER_ENABLED to 'true' via
    `az logicapp config appsettings set`.

    This app-setting gate - not the platform-level workflow
    Enabled/Disabled state - is the actual mechanism (decision, 2026-08-03,
    see PLAN.md section 17.7/17 addendum). The documented Standard Logic
    App per-workflow enable/disable management API could not be made to
    work reliably against this site: PATCH/PUT on the
    Microsoft.Web/sites/{site}/workflows/{name} ARM resource both return
    "Method Not Allowed" (that resource is read-only), and the
    hostruntime-proxied POST .../workflows/{name}/disable action returns
    "InvalidFlowExtensionRequestRoute" regardless of the auth mechanism
    tried (ARM bearer token, workflow_extension system key via ?code=
    query param, the same key via an x-functions-key header). GET on the
    base workflow resource does work with header-based key auth, so this
    is specifically a missing/undiscovered *write* action, not a wrong
    host or auth mechanism entirely - root cause not found. Rather than
    depend on a platform surface that could not be verified to work at
    all, wf-scheduled-copy checks its own gate app setting on every
    trigger firing and no-ops (succeeds without calling the engine)
    unless it is exactly the string 'true' - the workflow stays
    platform-Enabled always (avoiding the broken API entirely), and app
    settings are a well-documented, always-reliable mechanism to flip
    behavior instantly, with no redeploy required.

    wf-copy-invoices (the engine), wf-ondemand-copy, and wf-daily-digest
    are Request/Recurrence-triggered directly and are not gated by this
    mechanism.

    wf-file-trigger-copy (previously the other gated workflow) was
    removed entirely on 2026-08-10 - business confirmed the 15-min
    scheduled poll plus on-demand runs are sufficient, so this script no
    longer takes a -WorkflowName parameter.
.PARAMETER Environment
    'dev' or 'prod'.
.PARAMETER Force
    Skip the interactive confirmation prompt. Also use this instead of
    relying on `-Confirm:$false` in non-interactive/scripted contexts -
    some PowerShell hosts throw a NullReferenceException from
    $PSCmdlet.ShouldProcess() when no real console UI is attached, even
    with -Confirm:$false passed (confirmed empirically, 2026-08-03,
    Deploy-Workflows.ps1). -Force avoids calling ShouldProcess at all.
.EXAMPLE
    ./Enable-Triggers.ps1 -Environment prod
.EXAMPLE
    ./Enable-Triggers.ps1 -Environment dev -Force
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'modules/Inv2Sp.Common.psm1') -Force

$config = Get-Inv2SpEnvironmentConfig -Environment $Environment
Assert-Inv2SpAzLogin -Environment $Environment | Out-Null

if (-not (Test-Inv2SpActiveRole -Environment $Environment)) {
    throw "No active Contributor/Owner role on $($config.ResourceGroup). Run Invoke-PimActivation.ps1 -Environment $Environment first."
}

$workflowName = 'wf-scheduled-copy'
$settingName = 'SCHEDULED_TRIGGER_ENABLED'

Write-Host @"

You are about to enable the scheduled trigger that will start moving
REAL files in '$Environment' ($workflowName).

Make sure an on-demand run (Invoke-OnDemandRun.ps1) has already been
validated before proceeding.
"@ -ForegroundColor Yellow

if (-not $Force -and -not $PSCmdlet.ShouldProcess("$($config.LogicAppName)/$settingName", 'Set app setting to true')) {
    Write-Inv2SpLog "Skipped $workflowName (cancelled)." -Level Warn
    return
}

$current = Invoke-Inv2SpAz logicapp config appsettings list `
    -g $config.ResourceGroup `
    -n $config.LogicAppName `
    --output json
$currentValue = ($current | Where-Object { $_.name -eq $settingName }).value
if ($currentValue -eq 'true') {
    Write-Inv2SpLog "$workflowName ($settingName) is already 'true'." -Level Success
} else {
    Invoke-Inv2SpAz logicapp config appsettings set `
        -g $config.ResourceGroup `
        -n $config.LogicAppName `
        --settings "$settingName=true" | Out-Null
    Write-Inv2SpLog "$workflowName enabled ($settingName=true)." -Level Success
}

Write-Inv2SpLog 'Done. Monitor the next scheduled run and the daily digest closely for the first 24 hours.' -Level Info
