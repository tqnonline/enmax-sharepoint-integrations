function Invoke-PpDeploy {
    <#
    .SYNOPSIS
      Run the full 8-step deploy chain against a target Power Platform environment.

    .DESCRIPTION
      Orchestrates the complete end-to-end deployment in the following order:
        1. pac auth         — Connect-PpDataverse  (idempotent PAC CLI authentication)
        2. pack solution    — pp-deploy pack        (Python: pack Dataverse solution zip)
        3. import solution  — pp-deploy import      (Python: import solution async)
        4. register plugins — Register-PpPlugins    (build DLL + register Custom APIs / steps)
        5. patch optionsets — pp-deploy optionsets  (Python: patch option-set values)
        6. seed master data — pp-deploy seed        (Python: upsert seed/reference data)
        7. provision roles  — pp-deploy roles       (Python: create/patch security roles)
        8. publish Code App — Publish-PpCodeApp     (npm build + power-apps push)

      Credentials are loaded from .env.<Environment> via Get-PpEnvConfig and exported
      as DATAVERSE_* environment variables so Python subprocesses can inherit them.
      This mirrors the behaviour of scripts/deploy-local.ps1 which this cmdlet supersedes.

      WhatIf behaviour:
        PowerShell sub-cmdlets (Connect-PpDataverse, Register-PpPlugins, Publish-PpCodeApp)
        honour the inherited $WhatIfPreference automatically — no explicit -WhatIf pass-
        through is required. Python CLI steps receive --dry-run when -WhatIf or -DryRun is
        active so the Python side also previews without mutating Dataverse.

    .PARAMETER Environment
      The environment name matching a .env.<Environment> credential file, e.g. 'dev', 'uat'.

    .PARAMETER DryRun
      When set, passes --dry-run to every Python CLI step and additionally activates
      -WhatIf semantics for the PowerShell sub-cmdlets (by setting $WhatIfPreference).
      Use this flag when you want a pure preview across both halves of the deploy chain.

    .EXAMPLE
      Invoke-PpDeploy -Environment dev

      Runs the full 8-step deploy chain against the dev environment.

    .EXAMPLE
      Invoke-PpDeploy -Environment uat -WhatIf

      Dry-runs the deploy: PowerShell sub-cmdlets show ShouldProcess output without
      mutating state; Python CLI steps receive --dry-run.

    .EXAMPLE
      Invoke-PpDeploy -Environment uat -DryRun

      Same as -WhatIf but spelled out explicitly, useful in CI pipelines where
      the -WhatIf switch may be harder to surface.

    .NOTES
      This cmdlet supersedes scripts/deploy-local.ps1 (which becomes a thin shim in Task 7).
      Order is critical: solution import must complete before plugin registration; seed and
      roles must follow option-set patching; Code App must be published last.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)]
        [string]$Environment,

        [switch]$DryRun
    )

    Write-PpLog "Starting deploy to $Environment"

    # Load credentials and export as DATAVERSE_* so Python subprocesses inherit them.
    # (The pp-deploy CLI's own load_env also resolves these, but env-export keeps parity
    #  with deploy-local.ps1 and ensures os.environ wins over .env file parsing.)
    $cfg = Get-PpEnvConfig -Environment $Environment
    $env:DATAVERSE_URL           = $cfg.Url
    $env:DATAVERSE_CLIENT_ID     = $cfg.ClientId
    $env:DATAVERSE_CLIENT_SECRET = $cfg.ClientSecret
    $env:DATAVERSE_TENANT_ID     = $cfg.TenantId

    # Under -DryRun, activate WhatIf for PowerShell sub-cmdlets as well.
    if ($DryRun) { $WhatIfPreference = $true }

    # Determine whether python CLI steps should be run with --dry-run.
    $cliDryRun = $WhatIfPreference -or $DryRun

    # ── Step 1: pac auth ──────────────────────────────────────────────────────
    Write-PpLog "Step 1/8: pac CLI auth"
    Connect-PpDataverse -Environment $Environment

    # ── Step 2: pack solution ─────────────────────────────────────────────────
    Write-PpLog "Step 2/8: pack solution"
    Invoke-PpCli -Command 'pack' -Environment $Environment -DryRun:$cliDryRun

    # ── Step 3: import solution ───────────────────────────────────────────────
    Write-PpLog "Step 3/8: import solution"
    Invoke-PpCli -Command 'import' -Environment $Environment -DryRun:$cliDryRun

    # ── Step 4: register plugins ──────────────────────────────────────────────
    Write-PpLog "Step 4/8: register plugins"
    Register-PpPlugins -Environment $Environment

    # ── Step 5: patch option sets ─────────────────────────────────────────────
    Write-PpLog "Step 5/8: patch option sets"
    Invoke-PpCli -Command 'optionsets' -Environment $Environment -DryRun:$cliDryRun

    # ── Step 6: seed master data ──────────────────────────────────────────────
    Write-PpLog "Step 6/8: seed master data"
    Invoke-PpCli -Command 'seed' -Environment $Environment -DryRun:$cliDryRun

    # ── Step 7: provision roles ───────────────────────────────────────────────
    Write-PpLog "Step 7/8: provision roles"
    Invoke-PpCli -Command 'roles' -Environment $Environment -DryRun:$cliDryRun

    # ── Step 8: publish Code App ──────────────────────────────────────────────
    Write-PpLog "Step 8/8: publish Code App"
    Publish-PpCodeApp -Environment $Environment

    Write-PpLog "Deploy to $Environment complete."
}
