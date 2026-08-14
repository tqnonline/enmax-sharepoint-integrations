#Requires -Version 7.0
<#
.SYNOPSIS
    Orchestrates a full INV2SP deployment: prerequisites, infrastructure,
    then workflows.
.DESCRIPTION
    This is the primary deployment entry point (decision: local
    PIM-activated PowerShell scripts, not GitHub Actions automation - no
    service principal exists for this project, and the PIM/MFA activation
    step is inherently interactive; see PLAN.md section 16.1). GitHub
    Actions validates (build/lint/what-if) but never deploys.
.PARAMETER Environment
    'dev' or 'prod'.
.PARAMETER SkipPrerequisites
    Skip the Test-Prerequisites.ps1 preflight gate.
.PARAMETER SkipInfrastructure
    Skip Deploy-Infrastructure.ps1.
.PARAMETER SkipWorkflows
    Skip Deploy-Workflows.ps1.
.PARAMETER WhatIf
    Pass-through to Deploy-Infrastructure.ps1 - preview only, no
    workflow deploy either (there is no meaningful "what-if" for a zip
    deploy).
.PARAMETER Force
    Skip interactive confirmation prompts.
.EXAMPLE
    ./Deploy-All.ps1 -Environment dev -WhatIf
.EXAMPLE
    ./Deploy-All.ps1 -Environment dev
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [switch]$SkipPrerequisites,
    [switch]$SkipInfrastructure,
    [switch]$SkipWorkflows,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'modules/Inv2Sp.Common.psm1') -Force

Write-Inv2SpLog "=== INV2SP full deployment: $Environment ===" -Level Info

if (-not $SkipPrerequisites) {
    Write-Inv2SpLog '--- Step 1/3: Prerequisites ---' -Level Info
    & (Join-Path $PSScriptRoot 'Test-Prerequisites.ps1') -Environment $Environment
    if ($LASTEXITCODE -ne 0) {
        Write-Inv2SpLog 'Prerequisites failed. Fix the reported issues before continuing, or re-run with -SkipPrerequisites once you have deliberately accepted the gap (e.g. secrets not yet seeded before a first infra deploy).' -Level Error
        exit 1
    }
} else {
    Write-Inv2SpLog '--- Step 1/3: Prerequisites (skipped) ---' -Level Warn
}

if (-not $SkipInfrastructure) {
    Write-Inv2SpLog '--- Step 2/3: Infrastructure ---' -Level Info
    $infraParams = @{ Environment = $Environment }
    if ($WhatIfPreference) { $infraParams['WhatIf'] = $true }
    if ($Force) { $infraParams['Force'] = $true }
    & (Join-Path $PSScriptRoot 'Deploy-Infrastructure.ps1') @infraParams
} else {
    Write-Inv2SpLog '--- Step 2/3: Infrastructure (skipped) ---' -Level Warn
}

if ($WhatIfPreference) {
    Write-Inv2SpLog 'Stopping after infrastructure what-if (per -WhatIf) - workflows are not deployed in preview mode.' -Level Info
    exit 0
}

if (-not $SkipWorkflows) {
    Write-Inv2SpLog '--- Step 3/3: Workflows ---' -Level Info
    $workflowParams = @{ Environment = $Environment }
    if ($Force) { $workflowParams['Force'] = $true }
    & (Join-Path $PSScriptRoot 'Deploy-Workflows.ps1') @workflowParams
} else {
    Write-Inv2SpLog '--- Step 3/3: Workflows (skipped) ---' -Level Warn
}

Write-Inv2SpLog "=== Deployment to $Environment complete ===" -Level Success
Write-Inv2SpLog 'Next: run Invoke-OnDemandRun.ps1 to validate end-to-end before enabling the scheduled/file triggers (Enable-Triggers.ps1).' -Level Info
