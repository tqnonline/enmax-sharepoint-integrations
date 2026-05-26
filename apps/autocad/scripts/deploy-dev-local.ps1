#Requires -Version 7
<#
.SYNOPSIS
  Run the full dev deploy chain locally (mirrors .github/workflows/cd-dev.yml),
  for use when GitHub Actions CD is unavailable. Reads credentials from
  apps/code-app/.env.dev (gitignored; worktree falls back to the main repo).

  Chain: pac auth -> pack -> import (async) -> plugins -> optionsets -> seed
         -> roles -> publish Code App.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$EnvFile  = Join-Path $RepoRoot "apps\code-app\.env.dev"
if (-not (Test-Path $EnvFile)) {
    $GitCommonDir = & git -C $RepoRoot rev-parse --git-common-dir 2>$null
    if ($GitCommonDir) {
        $MainRepoRoot = Split-Path ([System.IO.Path]::GetFullPath($GitCommonDir)) -Parent
        $Fallback = Join-Path $MainRepoRoot "apps\code-app\.env.dev"
        if (Test-Path $Fallback) { Write-Host "    .env.dev via $Fallback" -ForegroundColor DarkGray; $EnvFile = $Fallback }
    }
}
if (-not (Test-Path $EnvFile)) { Write-Error ".env.dev not found at $EnvFile" }

$envmap = @{}
foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
    if ($line -match '^([^=]+)=(.*)$') { $envmap[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"') }
}

# Map .env.dev keys -> the DATAVERSE_* names the deploy scripts expect.
$env:DATAVERSE_URL           = $envmap['ENVIRONMENT_URL']
$env:DATAVERSE_CLIENT_ID     = $envmap['CLIENT_ID']
$env:DATAVERSE_CLIENT_SECRET = $envmap['CLIENT_SECRET']
$env:DATAVERSE_TENANT_ID     = $envmap['TENANT_ID']
$env:PATH += ";$env:USERPROFILE\.dotnet\tools"

if (-not $env:DATAVERSE_URL) { Write-Error "ENVIRONMENT_URL missing from .env.dev" }

function Invoke-Step {
    param([string]$Name, [scriptblock]$Body)
    Write-Host "`n==> $Name" -ForegroundColor Cyan
    & $Body
    if ($LASTEXITCODE -ne 0) { Write-Error "$Name FAILED (exit $LASTEXITCODE)" }
}

Write-Host "==> Authenticating PAC CLI..." -ForegroundColor Cyan
$authList = & pac auth list 2>&1
if ($authList -notmatch [regex]::Escape($env:DATAVERSE_URL)) {
    pac auth create --url $env:DATAVERSE_URL --applicationId $env:DATAVERSE_CLIENT_ID --clientSecret $env:DATAVERSE_CLIENT_SECRET --tenant $env:DATAVERSE_TENANT_ID
    if ($LASTEXITCODE -ne 0) { Write-Error "pac auth create failed" }
} else {
    Write-Host "    Auth profile already present." -ForegroundColor DarkGray
}

Push-Location $RepoRoot
try {
    Invoke-Step "Pack solution"     { python solution/scripts/pack.py }
    Invoke-Step "Import solution"   { python solution/scripts/import.py }
    Invoke-Step "Register plugins"  { & "$PSScriptRoot\deploy-plugins.ps1" }
    Invoke-Step "Patch option sets" { python solution/scripts/patch_optionsets.py }
    Invoke-Step "Seed master data"  { python solution/scripts/seed.py }
    Invoke-Step "Provision roles"   { python solution/scripts/provision_roles.py }
}
finally { Pop-Location }

Write-Host "`n==> Publishing Code App (build + push)..." -ForegroundColor Cyan
& "$PSScriptRoot\push-to-dev.ps1"

Write-Host "`n==> End-to-end dev deploy complete." -ForegroundColor Green
