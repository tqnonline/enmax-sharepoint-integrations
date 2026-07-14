#Requires -Version 7
<#
.SYNOPSIS
  Deploy to ENMAX DEV using USER pac auth only (no service principal / .env.dev).

.DESCRIPTION
  For environments where only an interactive user profile exists (e.g. pac profile
  "ENMAX DEV"). Uses:
    - pac solution pack/import for the Dataverse solution
    - Register-PpPlugins -UserAuth device for plugin DLL + Custom APIs
    - seed.py / backfill_taxonomy.py with --auth device for reference data
    - Publish-PpCodeApp -PacProfileName -UsePacCodePush for the Code App

  Backend (import, plugins, seed master, roles) already landed on ENMAX DEV via CI.
  Default: publish Code App + taxonomy backfill only.

.PARAMETER PacProfileName
  pac auth profile name (default: ENMAX DEV).

.PARAMETER AppId
  Code App GUID. When omitted, attempts discover_code_app.py (device login).

.PARAMETER UserAuth
  Python auth mode for Web API steps: device | interactive | azcli.

.PARAMETER Full
  Run the full chain (pack, import, plugins, seed master, roles, publish, backfill).
  Also gates the admin-solution (enmax_autocadadminsln) and flow-deploy steps: both
  only run when -Full is passed, matching the existing pack/import/plugins/seed/roles
  steps that are skipped otherwise (backend already landed via CI in the common case).

.PARAMETER IncludeAdminSolution
  When -Full is passed, also pack/import the admin solution (enmax_autocadadminsln —
  the UAT SharePoint test-harness flows) and deploy its flow catalog. Default: $true
  (dev is exactly the environment UAT harnesses are meant to run in — ADR 0005).
  Pass -IncludeAdminSolution:$false to skip it.

.PARAMETER DeployFlows
  When -Full is passed, also deploy the prod flow catalog (and the admin catalog when
  -IncludeAdminSolution) via Invoke-PpDeployFlows. Default: $true.

.EXAMPLE
  .\scripts\deploy-user-dev.ps1
  # Publish Code App + backfill using ENMAX DEV user profile.

.EXAMPLE
  .\scripts\deploy-user-dev.ps1 -AppId '<guid-from-maker-portal>'

.EXAMPLE
  .\scripts\deploy-user-dev.ps1 -Full
  # Full chain including admin solution pack/import + prod and admin flow deploy.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$PacProfileName = 'ENMAX DEV',
    [string]$AppId = $env:APP_ID,
    [ValidateSet('device', 'interactive', 'azcli')]
    [string]$UserAuth = 'azcli',
    [switch]$Full,
    [switch]$SkipPublish,
    [switch]$SkipBackfill,
    [switch]$SkipPlugins,
    [switch]$IncludeAdminSolution,
    [switch]$DeployFlows
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $PSBoundParameters.ContainsKey('IncludeAdminSolution')) { $IncludeAdminSolution = $true }
if (-not $PSBoundParameters.ContainsKey('DeployFlows'))          { $DeployFlows = $true }

$repoRoot = Split-Path $PSScriptRoot -Parent
Import-Module "$PSScriptRoot/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1" -Force
# Entry script uses private module helpers (Get-PpPacOrgWho, Invoke-PpPac, etc.).
foreach ($file in Get-ChildItem -Path "$PSScriptRoot/PowerPlatform.Deploy/Private" -Filter '*.ps1') {
    . $file.FullName
}

Write-Host "== ENMAX DEV deploy (user auth only) =="
Write-Host "Profile: $PacProfileName | Web API auth: $UserAuth"

Connect-PpDataverse -Environment dev -PacProfileName $PacProfileName
$org = Get-PpPacOrgWho
$env:DATAVERSE_URL = $org.Url
$env:ENVIRONMENT_ID = $org.ENVIRONMENT_ID
Write-Host "Target: $($org.Url) (env $($org.ENVIRONMENT_ID)) as $($org.UserEmail)"

function Set-UserDataverseToken {
    if ($env:DATAVERSE_ACCESS_TOKEN) { return }
    Write-Host "Acquiring user Dataverse token ($UserAuth login may prompt)..."
    $tokenScript = Join-Path $repoRoot 'solution/scripts/get_dataverse_token.py'
    $tokenOut = & python3 $tokenScript --auth $UserAuth --url $org.Url 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($tokenOut -join "`n") }
    $env:DATAVERSE_ACCESS_TOKEN = ($tokenOut | Select-Object -Last 1).ToString().Trim()
}

if ($Full) {
    Write-Host "`n-- pack + import (pac) --"
    python3 "$repoRoot/solution/scripts/pack.py"
    if ($LASTEXITCODE -ne 0) { throw "pack failed" }
    python3 "$repoRoot/solution/scripts/import.py"
    if ($LASTEXITCODE -ne 0) { throw "import failed" }

    if (-not $SkipPlugins) {
        Write-Host "`n-- register plugins (user token) --"
        Set-UserDataverseToken
        Register-PpPlugins -Environment dev -SkipBuild -UserAuth $UserAuth -DataverseUrl $org.Url
    }

    Write-Host "`n-- seed master (user token) --"
    Set-UserDataverseToken
    & python3 "$repoRoot/solution/scripts/seed.py" --scope master --auth $UserAuth --environment dev
    if ($LASTEXITCODE -ne 0) { throw "seed failed" }

    Write-Host "`n-- provision roles (user token) --"
    Set-UserDataverseToken
    & python3 "$repoRoot/solution/scripts/provision_roles.py"
    if ($LASTEXITCODE -ne 0) { throw "roles failed" }

    if ($DeployFlows) {
        Write-Host "`n-- deploy production flows ($UserAuth login may prompt) --"
        Invoke-PpDeployFlows -Environment dev -Catalog prod -Auth $UserAuth -Activate
    }

    if ($IncludeAdminSolution) {
        Write-Host "`n-- pack + import admin solution (pac) --"
        python3 "$repoRoot/solution/scripts/pack.py" --solution admin
        if ($LASTEXITCODE -ne 0) { throw "admin pack failed" }
        python3 "$repoRoot/solution/scripts/import.py" --solution admin
        if ($LASTEXITCODE -ne 0) { throw "admin import failed" }

        if ($DeployFlows) {
            Write-Host "`n-- deploy admin (UAT harness) flows ($UserAuth login may prompt) --"
            Invoke-PpDeployFlows -Environment dev -Catalog admin -Auth $UserAuth -Activate
        }
    }
}

if (-not $AppId) {
    Write-Host "`nDiscovering Code App id ($UserAuth login may prompt)..."
    Set-UserDataverseToken
    $discovered = & python3 "$repoRoot/solution/scripts/discover_code_app.py" --auth $UserAuth --url $org.Url 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Could not discover APP_ID. Pass -AppId or set `$env:APP_ID.`n$($discovered -join "`n")"
    }
    $AppId = ($discovered | Select-Object -Last 1).ToString().Trim()
    Write-Host "Discovered APP_ID: $AppId"
}
$env:APP_ID = $AppId

if (-not $SkipBackfill) {
    Write-Host "`n-- taxonomy backfill dry-run --"
    & python3 "$repoRoot/solution/scripts/backfill_taxonomy.py" --dry-run --auth $UserAuth
    if ($LASTEXITCODE -ne 0) { throw "backfill dry-run failed" }

    if ($PSCmdlet.ShouldProcess($org.Url, 'taxonomy backfill (null reservationtype only)')) {
        Write-Host "`n-- taxonomy backfill apply --"
        & python3 "$repoRoot/solution/scripts/backfill_taxonomy.py" --auth $UserAuth
        if ($LASTEXITCODE -ne 0) { throw "backfill failed" }
    }
}

if (-not $SkipPublish) {
    Write-Host "`n-- publish Code App (pac code push, user auth) --"
    Publish-PpCodeApp -Environment dev -PacProfileName $PacProfileName -UsePacCodePush -AppId $AppId
    Write-Host "`nPlay URL:"
    Write-Host "  https://apps.powerapps.com/play/e/$($org.ENVIRONMENT_ID)/app/$AppId"
}

Write-Host "`nDone (user-auth deploy)."
