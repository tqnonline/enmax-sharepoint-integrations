#Requires -Version 7
<#
.SYNOPSIS
  Publish the Power Apps Code App to UAT using USER (device-login) auth.

.DESCRIPTION
  UAT Code App deploy CANNOT use the SP-based Publish-PpCodeApp path: Service
  Principals cannot own code apps, so an SP push yields the runtime error
  "environment '...' does not allow this operation for this Code app '...'".
  This script publishes as the interactive user instead:

    1. Verifies the active pac auth profile is a USER (not Application/SPN) and
       targets the UAT environment URL. Aborts otherwise.
    2. Swaps apps/code-app/power.config.uat.json into power.config.json
       (backing up the current one).
    3. Runs `npm run build` then `pac code push` (uses the active user auth).
    4. ALWAYS restores the original power.config.json (try/finally), even on
       build/push failure, so local dev config is never left pointing at UAT.

  Prereqs:
    - pac CLI authed as a UAT user: `pac auth create --url <UAT url>` then
      `pac auth select --environment <UAT url>`.
    - apps/code-app/power.config.uat.json present (UAT appId + environmentId).
    - Node/npm + pac CLI on PATH.

.EXAMPLE
  .\scripts\push-codeapp-uat.ps1
#>

[CmdletBinding(SupportsShouldProcess)]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot   = Split-Path $PSScriptRoot -Parent
$codeApp    = Join-Path $repoRoot "apps\code-app"
$configMain = Join-Path $codeApp  "power.config.json"
$configUat  = Join-Path $codeApp  "power.config.uat.json"
$envUat     = Join-Path $codeApp  ".env.uat"

if (-not (Test-Path $configUat)) {
    throw "power.config.uat.json not found at $configUat. Create it with the UAT appId + environmentId."
}

# UAT environment URL from .env.uat (ENVIRONMENT_URL key).
$uatUrl = $null
if (Test-Path $envUat) {
    foreach ($line in Get-Content $envUat) {
        if ($line -match '^\s*ENVIRONMENT_URL\s*=\s*(.+)$') {
            $uatUrl = $Matches[1].Trim().Trim('"').Trim("'")
            break
        }
    }
}
if (-not $uatUrl -or $uatUrl -like '*FILL_ME*') {
    throw "ENVIRONMENT_URL not set in $envUat. Fill it with the UAT Dataverse URL."
}

# ── Auth guard: active profile must be a USER targeting the UAT URL ──────────
# pac auth list columns: Index Active Kind Name User Cloud Type Environment Url.
# The active row is marked with '*'. 'Type' is User or Application(SPN).
$authLines = & pac auth list
$activeRow = $authLines | Where-Object { $_ -match '\*' -and $_ -match 'https?://' }
if (-not $activeRow) {
    throw "No active pac auth profile. Run: pac auth create --url $uatUrl ; pac auth select --environment $uatUrl"
}
$urlHost = ([Uri]$uatUrl).Host
if ($activeRow -notmatch [regex]::Escape($urlHost)) {
    throw "Active pac auth profile does not target UAT ($urlHost).`nActive: $($activeRow.Trim())`nRun: pac auth select --environment $uatUrl"
}
if ($activeRow -match '\bApplication\b') {
    throw "Active pac auth profile is a Service Principal (Application). SPNs cannot own code apps. Auth as a USER: pac auth create --url $uatUrl (device/interactive login)."
}

Write-Host "Active pac auth OK (user, UAT): $($activeRow.Trim())"

# ── Swap config, build, push, ALWAYS restore ────────────────────────────────
$backup = "$configMain.bak"
if (-not $PSCmdlet.ShouldProcess($uatUrl, 'swap power.config -> UAT, npm build, pac code push')) {
    Write-Host "[WhatIf] Would push code app to UAT ($uatUrl)."
    return
}

if (Test-Path $configMain) { Copy-Item $configMain $backup -Force }
try {
    Copy-Item $configUat $configMain -Force
    Write-Host "Swapped in UAT power.config.json."

    Push-Location $codeApp
    try {
        Write-Host "Building..."
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed (exit $LASTEXITCODE)." }

        Write-Host "Pushing to UAT (pac code push, user auth)..."
        & pac code push
        if ($LASTEXITCODE -ne 0) { throw "pac code push failed (exit $LASTEXITCODE)." }
    }
    finally { Pop-Location }
}
finally {
    if (Test-Path $backup) {
        Copy-Item $backup $configMain -Force
        Remove-Item $backup -Force
        Write-Host "Restored original power.config.json (dev)."
    }
}

Write-Host "Done. UAT code app published as user."
