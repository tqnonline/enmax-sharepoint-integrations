function Invoke-PpDeploy {
    <#
    .SYNOPSIS
      Run the full deploy chain against a target Power Platform environment.

    .DESCRIPTION
      Orchestrates the complete end-to-end deployment in the following order:
        1.  pac auth           — Connect-PpDataverse       (idempotent PAC CLI authentication)
        2.  pack prod solution  — pp-deploy pack             (Python: pack enmax_autocadsln zip)
        3.  import prod solution— pp-deploy import           (Python: import enmax_autocadsln async)
        4.  register plugins   — Register-PpPlugins         (build DLL + register Custom APIs / steps)
        5.  patch optionsets   — pp-deploy optionsets        (Python: patch option-set values)
        6.  seed master data   — pp-deploy seed              (Python: upsert seed/reference data)
        7.  provision roles    — pp-deploy roles             (Python: create/patch security roles)
        8.  publish Code App   — Publish-PpCodeApp           (npm build + power-apps push)
        9.  deploy prod flows  — Invoke-PpDeployFlows        (--catalog prod, when -DeployFlows)
        10. pack+import admin  — pack.py/import.py --solution admin (when -IncludeAdminSolution)
        11. deploy admin flows — Invoke-PpDeployFlows        (--catalog admin, when -DeployFlows
                                                                and -IncludeAdminSolution)

      The admin solution (enmax_autocadadminsln) and its UAT harness flows are deployed
      LAST and only after the production solution, plugins, seed data, roles, and flows
      are fully in place — the UAT harness flows exercise that production plumbing
      (Child_Log_Flow_Exception, App Configuration keys, connection references) and must
      never run against a partially-deployed environment. See ADR 0005.

      Credentials are loaded from .env.<Environment> via Get-PpEnvConfig and exported
      as DATAVERSE_* environment variables so Python subprocesses can inherit them.
      This mirrors the behaviour of scripts/deploy-local.ps1 which this cmdlet supersedes.

      WhatIf behaviour:
        PowerShell sub-cmdlets (Connect-PpDataverse, Register-PpPlugins, Publish-PpCodeApp,
        Invoke-PpDeployFlows) honour the inherited $WhatIfPreference automatically — no
        explicit -WhatIf pass-through is required. Python CLI steps receive --dry-run when
        -WhatIf or -DryRun is active so the Python side also previews without mutating
        Dataverse.

    .PARAMETER Environment
      The environment name matching a .env.<Environment> credential file, e.g. 'dev', 'uat'.

    .PARAMETER DryRun
      When set, passes --dry-run to every Python CLI step and additionally activates
      -WhatIf semantics for the PowerShell sub-cmdlets (by setting $WhatIfPreference).
      Use this flag when you want a pure preview across both halves of the deploy chain.

    .PARAMETER IncludeAdminSolution
      Whether to pack, import, and deploy flows for the admin solution
      (enmax_autocadadminsln — the UAT test harness flows). When not explicitly
      passed, defaults to $true for 'dev'/'uat' and $false for 'prod' — a plain
      Invoke-PpDeploy -Environment prod never touches the admin solution unless
      this switch is passed explicitly.

    .PARAMETER DeployFlows
      Whether to run the flow-deploy steps (Invoke-PpDeployFlows) at all. Defaults to
      $true. Pass -DeployFlows:$false to skip flow deployment entirely (e.g. when only
      the Dataverse schema/data changed and flow definitions did not).

    .EXAMPLE
      Invoke-PpDeploy -Environment dev

      Runs the full chain against dev, including the admin solution and both flow catalogs.

    .EXAMPLE
      Invoke-PpDeploy -Environment prod

      Runs the full chain against prod. IncludeAdminSolution defaults to $false for
      prod, so the admin solution and UAT harness flows are never packed, imported,
      or deployed.

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
      roles must follow option-set patching; Code App must be published last; the admin
      solution and its flows must be packed/imported/deployed last of all (ADR 0005).
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)]
        [string]$Environment,

        [switch]$DryRun,

        [switch]$IncludeAdminSolution,

        [switch]$DeployFlows
    )

    # Default IncludeAdminSolution by environment when the caller didn't bind it
    # explicitly: UAT harnesses have no reason to exist in prod (ADR 0005).
    if (-not $PSBoundParameters.ContainsKey('IncludeAdminSolution')) {
        $IncludeAdminSolution = $Environment -in @('dev', 'uat')
    }
    # DeployFlows defaults to on; only an explicit -DeployFlows:$false skips it.
    if (-not $PSBoundParameters.ContainsKey('DeployFlows')) {
        $DeployFlows = $true
    }

    Write-PpLog "Starting deploy to $Environment (IncludeAdminSolution=$IncludeAdminSolution, DeployFlows=$DeployFlows)"

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
    Write-PpLog "Step 1/11: pac CLI auth"
    Connect-PpDataverse -Environment $Environment

    # ── Step 2: pack prod solution ────────────────────────────────────────────
    Write-PpLog "Step 2/11: pack prod solution"
    Invoke-PpCli -Command 'pack' -Environment $Environment -DryRun:$cliDryRun

    # ── Step 3: import prod solution ──────────────────────────────────────────
    Write-PpLog "Step 3/11: import prod solution"
    Invoke-PpCli -Command 'import' -Environment $Environment -DryRun:$cliDryRun

    # ── Step 4: register plugins ──────────────────────────────────────────────
    Write-PpLog "Step 4/11: register plugins"
    Register-PpPlugins -Environment $Environment

    # ── Step 5: patch option sets ─────────────────────────────────────────────
    Write-PpLog "Step 5/11: patch option sets"
    Invoke-PpCli -Command 'optionsets' -Environment $Environment -DryRun:$cliDryRun

    # ── Step 6: seed master data ──────────────────────────────────────────────
    Write-PpLog "Step 6/11: seed master data"
    Invoke-PpCli -Command 'seed' -Environment $Environment -DryRun:$cliDryRun

    # ── Step 7: provision roles ───────────────────────────────────────────────
    Write-PpLog "Step 7/11: provision roles"
    Invoke-PpCli -Command 'roles' -Environment $Environment -DryRun:$cliDryRun

    # ── Step 8: publish Code App ──────────────────────────────────────────────
    Write-PpLog "Step 8/11: publish Code App"
    Publish-PpCodeApp -Environment $Environment

    # ── Step 9: deploy production flows ───────────────────────────────────────
    if ($DeployFlows) {
        Write-PpLog "Step 9/11: deploy production flows"
        Invoke-PpDeployFlows -Environment $Environment -Catalog 'prod' -Activate -DryRun:$cliDryRun
    } else {
        Write-PpLog "Step 9/11: deploy production flows — skipped (-DeployFlows:`$false)" -Level Verbose
    }

    # ── Step 10: pack + import admin solution ─────────────────────────────────
    if ($IncludeAdminSolution) {
        Write-PpLog "Step 10/11: pack + import admin solution"
        Invoke-PpPackAdminSolution -DryRun:$cliDryRun
        Invoke-PpImportAdminSolution -DryRun:$cliDryRun
    } else {
        Write-PpLog "Step 10/11: pack + import admin solution — skipped (-IncludeAdminSolution:`$false)" -Level Verbose
    }

    # ── Step 11: deploy admin (UAT harness) flows ─────────────────────────────
    if ($DeployFlows -and $IncludeAdminSolution) {
        Write-PpLog "Step 11/11: deploy admin flows"
        Invoke-PpDeployFlows -Environment $Environment -Catalog 'admin' -Activate -DryRun:$cliDryRun
    } else {
        Write-PpLog "Step 11/11: deploy admin flows — skipped" -Level Verbose
    }

    Write-PpLog "Deploy to $Environment complete."
}

# ═════════════════════════════════════════════════════════════════════════════
# File-scoped helpers (dot-sourced into module scope; NOT exported)
# ═════════════════════════════════════════════════════════════════════════════

function Invoke-PpPackAdminSolution {
    <#
    .SYNOPSIS Thin, mockable wrapper around `python solution/scripts/pack.py --solution admin`. #>
    [CmdletBinding()]
    param([switch]$DryRun)
    if ($DryRun) {
        Write-PpLog "  DRY-RUN pack.py --solution admin" -Level Verbose
        return
    }
    $repoRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
    $script   = Join-Path $repoRoot 'solution/scripts/pack.py'
    Invoke-PpPythonScript -ScriptPath $script -Arguments @('--solution', 'admin')
    Assert-PpExitCode -Operation 'pack.py --solution admin'
}

function Invoke-PpImportAdminSolution {
    <#
    .SYNOPSIS Thin, mockable wrapper around `python solution/scripts/import.py --solution admin`. #>
    [CmdletBinding()]
    param([switch]$DryRun)
    if ($DryRun) {
        Write-PpLog "  DRY-RUN import.py --solution admin" -Level Verbose
        return
    }
    $repoRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
    $script   = Join-Path $repoRoot 'solution/scripts/import.py'
    Invoke-PpPythonScript -ScriptPath $script -Arguments @('--solution', 'admin')
    Assert-PpExitCode -Operation 'import.py --solution admin'
}
