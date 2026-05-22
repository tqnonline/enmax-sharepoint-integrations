#Requires -Version 7
<#
.SYNOPSIS
  Build the Code App and push it to the dev PowerApps environment.
  Reads credentials from apps/code-app/.env.dev (gitignored).

.USAGE
  From repo root:  .\scripts\push-to-dev.ps1
  From code-app:   ..\..\..\scripts\push-to-dev.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot  = Split-Path $PSScriptRoot -Parent
$CodeApp   = Join-Path $RepoRoot "apps\code-app"
$EnvFile   = Join-Path $CodeApp ".env.dev"
$ConfigOut = Join-Path $CodeApp "power.config.json"

# ── Load .env.dev ────────────────────────────────────────────────────────────
# In a git worktree .env.dev is gitignored and won't be present; fall back to
# the main repo checkout so the file only needs to exist in one place.
if (-not (Test-Path $EnvFile)) {
    $GitCommonDir = & git -C $RepoRoot rev-parse --git-common-dir 2>$null
    if ($GitCommonDir) {
        $MainRepoRoot = Split-Path ([System.IO.Path]::GetFullPath($GitCommonDir)) -Parent
        $FallbackEnv  = Join-Path $MainRepoRoot "apps\code-app\.env.dev"
        if (Test-Path $FallbackEnv) {
            Write-Host "    .env.dev not in worktree — using $FallbackEnv" -ForegroundColor DarkGray
            $EnvFile = $FallbackEnv
        }
    }
}
if (-not (Test-Path $EnvFile)) {
    Write-Error ".env.dev not found. Place it at $CodeApp\.env.dev (or in the main repo checkout at the same relative path)."
}

$env = @{}
foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
    if ($line -match '^([^=]+)=(.*)$') {
        $env[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"')
    }
}

$tenantId    = $env['TENANT_ID']
$clientId    = $env['CLIENT_ID']
$clientSecret = $env['CLIENT_SECRET']
$envUrl      = $env['ENVIRONMENT_URL']
$envId       = $env['ENVIRONMENT_ID']
$appId       = $env['APP_ID']
$appName     = $env['APP_DISPLAY_NAME']

# ── Ensure PAC CLI auth ──────────────────────────────────────────────────────
Write-Host "==> Authenticating PAC CLI..." -ForegroundColor Cyan
$env:PATH += ";$env:USERPROFILE\.dotnet\tools"

$authList = & pac auth list 2>&1
if ($authList -notmatch $envUrl) {
    pac auth create `
        --url         $envUrl `
        --applicationId $clientId `
        --clientSecret  $clientSecret `
        --tenant        $tenantId
} else {
    Write-Host "    Auth profile for $envUrl already exists, skipping create."
}

# Select the first (only) auth profile by index
pac auth select --index 1 2>$null

# ── Write / patch power.config.json ─────────────────────────────────────────
Write-Host "==> Writing power.config.json..." -ForegroundColor Cyan
$config = @{
    version          = "1.0"
    appId            = $appId
    appDisplayName   = $appName
    region           = "prod"
    environmentId    = $envId
    description      = " "
    buildPath        = "./dist"
    buildEntryPoint  = "index.html"
    localAppUrl      = "http://localhost:3000"
    logoPath         = "Default"
    connectionReferences  = @{}
    databaseReferences    = @{
        "default.cds" = @{
            dataSources = @{
                enmax_autocadappconfigs          = @{ entitySetName = "enmax_autocadappconfigs";          logicalName = "enmax_autocadappconfig";          isHidden = $false }
                enmax_autocadreservations        = @{ entitySetName = "enmax_autocadreservations";        logicalName = "enmax_autocadreservation";        isHidden = $false }
                enmax_autocaddrawings            = @{ entitySetName = "enmax_autocaddrawings";            logicalName = "enmax_autocaddrawing";            isHidden = $false }
                enmax_autocadsheets              = @{ entitySetName = "enmax_autocadsheets";              logicalName = "enmax_autocadsheet";              isHidden = $false }
                enmax_autocadcheckouts           = @{ entitySetName = "enmax_autocadcheckouts";           logicalName = "enmax_autocadcheckout";           isHidden = $false }
                enmax_autocadbusinesses          = @{ entitySetName = "enmax_autocadbusinesses";          logicalName = "enmax_autocadbusiness";           isHidden = $false }
                enmax_autocadassets              = @{ entitySetName = "enmax_autocadassets";              logicalName = "enmax_autocadasset";              isHidden = $false }
                enmax_autocadunits               = @{ entitySetName = "enmax_autocadunits";               logicalName = "enmax_autocadunit";               isHidden = $false }
                enmax_autocaddomains             = @{ entitySetName = "enmax_autocaddomains";             logicalName = "enmax_autocaddomain";             isHidden = $false }
                enmax_autocadsystems             = @{ entitySetName = "enmax_autocadsystems";             logicalName = "enmax_autocadsystem";             isHidden = $false }
                enmax_autocadkinds               = @{ entitySetName = "enmax_autocadkinds";               logicalName = "enmax_autocadkind";               isHidden = $false }
                enmax_autocadbusinessassets      = @{ entitySetName = "enmax_autocadbusinessassets";      logicalName = "enmax_autocadbusinessasset";      isHidden = $false }
                enmax_autocadassetunits          = @{ entitySetName = "enmax_autocadassetunits";          logicalName = "enmax_autocadassetunit";          isHidden = $false }
                enmax_autocadsystemscopes        = @{ entitySetName = "enmax_autocadsystemscopes";        logicalName = "enmax_autocadsystemscope";        isHidden = $false }
                enmax_autocadnumbersequences     = @{ entitySetName = "enmax_autocadnumbersequences";     logicalName = "enmax_autocadnumbersequence";     isHidden = $false }
                enmax_autocadauditevents         = @{ entitySetName = "enmax_autocadauditevents";         logicalName = "enmax_autocadauditevent";         isHidden = $false }
                enmax_autocadrecordtypes         = @{ entitySetName = "enmax_autocadrecordtypes";         logicalName = "enmax_autocadrecordtype";         isHidden = $false }
                enmax_autocadrecordphases        = @{ entitySetName = "enmax_autocadrecordphases";        logicalName = "enmax_autocadrecordphase";        isHidden = $false }
                enmax_autocadvendors             = @{ entitySetName = "enmax_autocadvendors";             logicalName = "enmax_autocadvendor";             isHidden = $false }
                enmax_autocadbroadcasts          = @{ entitySetName = "enmax_autocadbroadcasts";          logicalName = "enmax_autocadbroadcast";          isHidden = $false }
                enmax_autocadbroadcastdismissals = @{ entitySetName = "enmax_autocadbroadcastdismissals"; logicalName = "enmax_autocadbroadcastdismissal"; isHidden = $false }
                enmax_autocaduserpreferences     = @{ entitySetName = "enmax_autocaduserpreferences";     logicalName = "enmax_autocaduserpreference";     isHidden = $false }
                enmax_autocadinappnotifications  = @{ entitySetName = "enmax_autocadinappnotifications";  logicalName = "enmax_autocadinappnotification";  isHidden = $false }
                teams                           = @{ entitySetName = "teams";                           logicalName = "team";                           isHidden = $false }
                systemusers                     = @{ entitySetName = "systemusers";                     logicalName = "systemuser";                     isHidden = $false }
            }
            environmentVariableName = ""
        }
    }
}
$config | ConvertTo-Json -Depth 5 | Set-Content $ConfigOut -Encoding UTF8

# ── Build ────────────────────────────────────────────────────────────────────
Write-Host "==> Building..." -ForegroundColor Cyan
Push-Location $CodeApp
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Build failed." }

    # ── Push ─────────────────────────────────────────────────────────────────
    Write-Host "==> Pushing to PowerApps..." -ForegroundColor Cyan
    npx power-apps push --non-interactive
    if ($LASTEXITCODE -ne 0) { Write-Error "Push failed." }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "==> Done! Open app at:" -ForegroundColor Green
Write-Host "    https://apps.powerapps.com/play/e/$envId/app/$appId" -ForegroundColor Green
