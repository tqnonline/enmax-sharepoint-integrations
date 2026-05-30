function Publish-PpCodeApp {
    <#
    .SYNOPSIS
      Build the Power Apps Code App and push it to a target Power Platform environment.

    .DESCRIPTION
      Performs the following steps:
        1. Loads credentials from .env.<Environment> via Get-PpEnvConfig.
        2. Ensures pac CLI is authenticated via Connect-PpDataverse (idempotent).
        3. Writes apps\code-app\power.config.json with the environment-specific
           configuration, including the full databaseReferences dataSources map
           (25 Dataverse entity sets) required for the app's data bindings.
        4. Runs `npm run build` in apps\code-app.
        5. Runs `pac code push` (uses the pac auth profile set up by Connect-PpDataverse).
        6. Prints the play URL so it can be opened immediately.

      Steps 3–5 (config write, build, push) are guarded by SupportsShouldProcess —
      pass -WhatIf for a dry run that skips all side-effecting operations.

    .PARAMETER Environment
      The environment name matching a .env.<Environment> file, e.g. 'dev', 'uat'.

    .EXAMPLE
      Publish-PpCodeApp -Environment dev

      Builds and publishes the Code App to the dev Power Platform environment.

    .EXAMPLE
      Publish-PpCodeApp -Environment dev -WhatIf

      Shows what would happen without writing files, running npm, or calling pac.
      Safe for dry-run validation in CI pipelines.

    .NOTES
      Requires pac CLI installed as a dotnet global tool.
      Requires Node.js and npm available on PATH.
      Credentials are read from apps\code-app\.env.<Environment> with a git-worktree
      fallback to the main repo checkout (see Get-PpEnvConfig).
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)]
        [string]$Environment
    )

    $cfg = Get-PpEnvConfig -Environment $Environment

    # Ensure pac CLI is authenticated (idempotent; honours -WhatIf via SupportsShouldProcess)
    $connectParams = @{ Environment = $Environment }
    if ($WhatIfPreference) { $connectParams['WhatIf'] = $true }
    Connect-PpDataverse @connectParams

    # ── Resolve paths ─────────────────────────────────────────────────────────
    $moduleRoot = Split-Path $PSScriptRoot -Parent                    # scripts/PowerPlatform.Deploy/
    $repoRoot   = Split-Path (Split-Path $moduleRoot -Parent) -Parent # repo root (module -> scripts -> repo)
    $codeApp    = Join-Path $repoRoot "apps\code-app"
    $configOut  = Join-Path $codeApp  "power.config.json"

    if ($PSCmdlet.ShouldProcess($configOut, 'Write power.config.json + npm build + power-apps push')) {

        # ── Write power.config.json ───────────────────────────────────────────
        Write-PpLog "Writing power.config.json..."
        $config = Get-PpCodeAppConfig -Cfg $cfg
        $config | ConvertTo-Json -Depth 5 | Set-Content $configOut -Encoding UTF8

        # ── Build + Push ──────────────────────────────────────────────────────
        Write-PpLog "Running npm build..."
        Invoke-PpNpm -WorkingDir $codeApp -Arguments @('run', 'build')
        Assert-PpExitCode -Operation 'npm run build'

        Write-PpLog "Pushing to Power Apps..."
        Invoke-PpPowerAppsPush -WorkingDir $codeApp
        Assert-PpExitCode -Operation 'pac code push'

        Write-PpLog "Done! Open app at:"
        Write-PpLog "  https://apps.powerapps.com/play/e/$($cfg['ENVIRONMENT_ID'])/app/$($cfg['APP_ID'])"
    }
}

# ═════════════════════════════════════════════════════════════════════════════
# File-scoped helpers (dot-sourced into module scope; NOT exported)
# ═════════════════════════════════════════════════════════════════════════════

function Get-PpCodeAppConfig {
    <#
    .SYNOPSIS
      Builds the power.config.json object from environment config. Pure — no side effects.
      Extracted as a function so the dataSources map can be unit-tested in isolation.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][hashtable]$Cfg)

    return @{
        version         = "1.0"
        appId           = $Cfg['APP_ID']
        appDisplayName  = $Cfg['APP_DISPLAY_NAME']
        region          = "prod"
        environmentId   = $Cfg['ENVIRONMENT_ID']
        description     = " "
        buildPath       = "./dist"
        buildEntryPoint = "index.html"
        localAppUrl     = "http://localhost:3000"
        logoPath        = "Default"
        connectionReferences = @{}
        databaseReferences   = @{
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
                    teams                            = @{ entitySetName = "teams";       logicalName = "team";       isHidden = $false }
                    systemusers                      = @{ entitySetName = "systemusers"; logicalName = "systemuser"; isHidden = $false }
                }
                environmentVariableName = ""
            }
        }
    }
}

function Invoke-PpNpm {
    <#
    .SYNOPSIS Thin, mockable wrapper around npm. Seam for Pester mocking. #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$WorkingDir,
        [Parameter(Mandatory)][string[]]$Arguments
    )
    Push-Location $WorkingDir
    try   { & npm @Arguments }
    finally { Pop-Location }
}

function Invoke-PpPowerAppsPush {
    <#
    .SYNOPSIS Thin, mockable wrapper around the Code App push CLI. Seam for Pester mocking.
    .DESCRIPTION
      Uses `pac code push` (the Power Platform CLI command) rather than
      `npx power-apps push`. pac uses the active pac auth profile (which CD sets up
      via `pac auth create` with our SPN) and avoids the npm CLI's separate
      SP_CLIENT_ID/SP_CLIENT_SECRET checkAccess path that requires the SPN to have
      Power Platform Administrator at the tenant level.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$WorkingDir)
    Push-Location $WorkingDir
    try   { & pac code push }
    finally { Pop-Location }
}
