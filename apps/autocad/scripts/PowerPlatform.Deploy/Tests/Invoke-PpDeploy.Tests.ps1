#Requires -Version 7
<#
  Tests for Invoke-PpDeploy (Public cmdlet) and Invoke-PpCli (Private helper).
  WHY each test exists is documented inline.
  ALL sub-steps are mocked — no real python, pac, npm, or dotnet is invoked.
#>

BeforeAll {
    $RepoRoot     = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
    $ManifestPath = Join-Path $RepoRoot 'scripts\PowerPlatform.Deploy\PowerPlatform.Deploy.psd1'
    Import-Module $ManifestPath -Force

    # Invoke-PpDeploy intentionally exports $env:DATAVERSE_* (so the Python subprocess
    # inherits credentials — mirrors deploy-local.ps1). That mutates the shared process
    # environment. Snapshot the originals here and restore them in AfterAll so this file
    # never leaks env state into other test files (e.g. Register-PpPlugins reads
    # $env:DATAVERSE_* directly and would otherwise pick up our fake values).
    $script:OrigEnv = @{
        DATAVERSE_URL           = $env:DATAVERSE_URL
        DATAVERSE_CLIENT_ID     = $env:DATAVERSE_CLIENT_ID
        DATAVERSE_CLIENT_SECRET = $env:DATAVERSE_CLIENT_SECRET
        DATAVERSE_TENANT_ID     = $env:DATAVERSE_TENANT_ID
    }
}

AfterAll {
    foreach ($key in $script:OrigEnv.Keys) {
        $orig = $script:OrigEnv[$key]
        if ($null -eq $orig) {
            Remove-Item -Path "Env:$key" -ErrorAction SilentlyContinue
        } else {
            Set-Item -Path "Env:$key" -Value $orig
        }
    }
}

Describe 'Invoke-PpDeploy — parameter contract' {

    It '-Environment is Mandatory' {
        # WHY: Without a mandatory Environment the cmdlet could silently target nothing or
        # the wrong environment. Enforcing the parameter at declaration level prevents
        # accidental no-op invocations that would look like a successful deploy.
        $param = (Get-Command Invoke-PpDeploy).Parameters['Environment']
        $isMandatory = $param.Attributes |
            Where-Object { $_ -is [System.Management.Automation.ParameterAttribute] } |
            Select-Object -ExpandProperty Mandatory
        $isMandatory | Should -BeTrue
    }
}

Describe 'Invoke-PpDeploy — 8-step order (sequence collector)' {
    # WHY: The deploy chain is order-dependent. import must precede plugin registration
    # (plugins reference newly-imported entities); seed/roles must follow optionsets
    # (seeded records reference option-set values); Code App must be published last
    # (it depends on the registered APIs and seeded config data). A reordered chain
    # breaks the deployment. This test encodes the required order explicitly so any
    # future reordering is caught before it reaches an environment.

    BeforeAll {
        $script:FakeCfg = @{
            Url          = 'https://dev.crm.dynamics.com'
            ClientId     = 'fake-client-id'
            ClientSecret = 'fake-secret'
            TenantId     = 'fake-tenant'
        }
        Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig { return $script:FakeCfg }
        Mock -ModuleName PowerPlatform.Deploy Connect-PpDataverse {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpCli {
            param([string]$Command, [string]$Environment, [switch]$DryRun, [switch]$VerboseCli)
        }
        Mock -ModuleName PowerPlatform.Deploy Register-PpPlugins {}
        Mock -ModuleName PowerPlatform.Deploy Publish-PpCodeApp {}
    }

    It 'executes all 8 steps in the correct order' {
        # WHY: ORDER IS A CORRECTNESS INVARIANT. If the sequence changes (e.g. roles before
        # seed, or plugins before import), the deploy produces a partially-broken environment.
        # Encode the exact required sequence so any swap is immediately visible.
        $calls = [System.Collections.Generic.List[string]]::new()

        Mock -ModuleName PowerPlatform.Deploy Connect-PpDataverse  { $calls.Add('connect') }
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpCli {
            param([string]$Command, [string]$Environment, [switch]$DryRun, [switch]$VerboseCli)
            $calls.Add($Command)
        }
        Mock -ModuleName PowerPlatform.Deploy Register-PpPlugins   { $calls.Add('plugins') }
        Mock -ModuleName PowerPlatform.Deploy Publish-PpCodeApp     { $calls.Add('publish') }

        Invoke-PpDeploy -Environment dev

        $expectedOrder = @('connect', 'pack', 'import', 'plugins', 'optionsets', 'seed', 'roles', 'publish')
        $calls | Should -Be $expectedOrder
    }
}

Describe 'Invoke-PpDeploy — step call counts (normal run)' {
    # WHY: Verify each sub-step is invoked the correct number of times. An extra or missing
    # call (e.g., double-import or skipped seed) would corrupt the environment state.

    BeforeAll {
        $script:FakeCfg2 = @{
            Url          = 'https://dev.crm.dynamics.com'
            ClientId     = 'fake-client-id'
            ClientSecret = 'fake-secret'
            TenantId     = 'fake-tenant'
        }
        Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig { return $script:FakeCfg2 }
        Mock -ModuleName PowerPlatform.Deploy Connect-PpDataverse {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpCli {
            param([string]$Command, [string]$Environment, [switch]$DryRun, [switch]$VerboseCli)
        }
        Mock -ModuleName PowerPlatform.Deploy Register-PpPlugins {}
        Mock -ModuleName PowerPlatform.Deploy Publish-PpCodeApp {}
    }

    It 'calls Connect-PpDataverse exactly once' {
        Invoke-PpDeploy -Environment dev
        Should -Invoke Connect-PpDataverse -ModuleName PowerPlatform.Deploy -Times 1 -Exactly
    }

    It 'calls Invoke-PpCli with pack exactly once' {
        Invoke-PpDeploy -Environment dev
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -Times 1 -Exactly -ParameterFilter {
            $Command -eq 'pack'
        }
    }

    It 'calls Invoke-PpCli with import exactly once' {
        Invoke-PpDeploy -Environment dev
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -Times 1 -Exactly -ParameterFilter {
            $Command -eq 'import'
        }
    }

    It 'calls Register-PpPlugins exactly once' {
        Invoke-PpDeploy -Environment dev
        Should -Invoke Register-PpPlugins -ModuleName PowerPlatform.Deploy -Times 1 -Exactly
    }

    It 'calls Invoke-PpCli with optionsets exactly once' {
        Invoke-PpDeploy -Environment dev
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -Times 1 -Exactly -ParameterFilter {
            $Command -eq 'optionsets'
        }
    }

    It 'calls Invoke-PpCli with seed exactly once' {
        Invoke-PpDeploy -Environment dev
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -Times 1 -Exactly -ParameterFilter {
            $Command -eq 'seed'
        }
    }

    It 'calls Invoke-PpCli with roles exactly once' {
        Invoke-PpDeploy -Environment dev
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -Times 1 -Exactly -ParameterFilter {
            $Command -eq 'roles'
        }
    }

    It 'calls Publish-PpCodeApp exactly once' {
        Invoke-PpDeploy -Environment dev
        Should -Invoke Publish-PpCodeApp -ModuleName PowerPlatform.Deploy -Times 1 -Exactly
    }

    It 'calls Invoke-PpCli exactly 5 times total (pack, import, optionsets, seed, roles)' {
        # WHY: Guards against accidental extra CLI invocations that would repeat expensive
        # or idempotent-but-slow Python steps.
        Invoke-PpDeploy -Environment dev
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -Times 5 -Exactly
    }

    It 'passes the correct Environment to Connect-PpDataverse' {
        Invoke-PpDeploy -Environment dev
        Should -Invoke Connect-PpDataverse -ModuleName PowerPlatform.Deploy -ParameterFilter {
            $Environment -eq 'dev'
        }
    }

    It 'passes the correct Environment to each Invoke-PpCli call' {
        Invoke-PpDeploy -Environment dev
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -Times 5 -ParameterFilter {
            $Environment -eq 'dev'
        }
    }
}

Describe 'Invoke-PpDeploy — -WhatIf causes CLI steps to run with -DryRun' {
    # WHY: Under -WhatIf the deploy chain must be fully non-mutating. The PowerShell
    # sub-cmdlets (Connect / Register / Publish) honour $WhatIfPreference automatically.
    # The Python CLI steps must also receive --dry-run so no Dataverse records are written.
    # Asserting DryRun is set under -WhatIf is the key safety guarantee for this flag.

    BeforeAll {
        $script:FakeCfgWi = @{
            Url          = 'https://dev.crm.dynamics.com'
            ClientId     = 'fake-client-id'
            ClientSecret = 'fake-secret'
            TenantId     = 'fake-tenant'
        }
        Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig { return $script:FakeCfgWi }
        Mock -ModuleName PowerPlatform.Deploy Connect-PpDataverse {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpCli {
            param([string]$Command, [string]$Environment, [switch]$DryRun, [switch]$VerboseCli)
        }
        Mock -ModuleName PowerPlatform.Deploy Register-PpPlugins {}
        Mock -ModuleName PowerPlatform.Deploy Publish-PpCodeApp {}
    }

    It 'passes -DryRun to Invoke-PpCli for the pack step under -WhatIf' {
        Invoke-PpDeploy -Environment dev -WhatIf 2>$null
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -ParameterFilter {
            $Command -eq 'pack' -and $DryRun -eq $true
        }
    }

    It 'passes -DryRun to Invoke-PpCli for the import step under -WhatIf' {
        Invoke-PpDeploy -Environment dev -WhatIf 2>$null
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -ParameterFilter {
            $Command -eq 'import' -and $DryRun -eq $true
        }
    }

    It 'passes -DryRun to all 5 Invoke-PpCli calls under -WhatIf' {
        # WHY: Every Python CLI step must preview; missing one leaves a mutation path
        # open under a supposedly dry-run invocation.
        Invoke-PpDeploy -Environment dev -WhatIf 2>$null
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -Times 5 -ParameterFilter {
            $DryRun -eq $true
        }
    }
}

Describe 'Invoke-PpDeploy — -DryRun causes CLI steps to run with -DryRun' {
    # WHY: -DryRun is the explicit (non-WhatIf) dry-run path used in CI pipelines.
    # It must behave identically to -WhatIf for the Python CLI steps.

    BeforeAll {
        $script:FakeCfgDr = @{
            Url          = 'https://dev.crm.dynamics.com'
            ClientId     = 'fake-client-id'
            ClientSecret = 'fake-secret'
            TenantId     = 'fake-tenant'
        }
        Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig { return $script:FakeCfgDr }
        Mock -ModuleName PowerPlatform.Deploy Connect-PpDataverse {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpCli {
            param([string]$Command, [string]$Environment, [switch]$DryRun, [switch]$VerboseCli)
        }
        Mock -ModuleName PowerPlatform.Deploy Register-PpPlugins {}
        Mock -ModuleName PowerPlatform.Deploy Publish-PpCodeApp {}
    }

    It 'passes -DryRun to all 5 Invoke-PpCli calls under -DryRun' {
        Invoke-PpDeploy -Environment dev -DryRun
        Should -Invoke Invoke-PpCli -ModuleName PowerPlatform.Deploy -Times 5 -ParameterFilter {
            $DryRun -eq $true
        }
    }
}

Describe 'Invoke-PpDeploy — DATAVERSE_* env vars exported from cfg' {
    # WHY: Python subprocesses must inherit DATAVERSE_* credentials. If these are not
    # exported, the Python CLI cannot authenticate and every pp-deploy step fails with
    # a cryptic authentication error. This test asserts the export happens before any
    # CLI step executes (captured via side-effect on the first Invoke-PpCli call).

    BeforeAll {
        $script:FakeCfgEnv = @{
            Url          = 'https://uat.crm.dynamics.com'
            ClientId     = 'uat-client-id'
            ClientSecret = 'uat-secret'
            TenantId     = 'uat-tenant'
        }
        Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig { return $script:FakeCfgEnv }
        Mock -ModuleName PowerPlatform.Deploy Connect-PpDataverse {}
        Mock -ModuleName PowerPlatform.Deploy Register-PpPlugins {}
        Mock -ModuleName PowerPlatform.Deploy Publish-PpCodeApp {}

        # Capture all four env vars on the first Invoke-PpCli call (pack step).
        # Mock body runs inside the module scope but $script: vars are shared.
        $script:envCapUrl    = $null
        $script:envCapCid    = $null
        $script:envCapSecret = $null
        $script:envCapTenant = $null

        Mock -ModuleName PowerPlatform.Deploy Invoke-PpCli {
            param([string]$Command, [string]$Environment, [switch]$DryRun, [switch]$VerboseCli)
            if ($null -eq $script:envCapUrl) {
                $script:envCapUrl    = $env:DATAVERSE_URL
                $script:envCapCid    = $env:DATAVERSE_CLIENT_ID
                $script:envCapSecret = $env:DATAVERSE_CLIENT_SECRET
                $script:envCapTenant = $env:DATAVERSE_TENANT_ID
            }
        }

        Invoke-PpDeploy -Environment uat
    }

    It 'sets $env:DATAVERSE_URL from cfg before CLI steps' {
        $script:envCapUrl | Should -Be 'https://uat.crm.dynamics.com'
    }

    It 'sets $env:DATAVERSE_CLIENT_ID from cfg before CLI steps' {
        $script:envCapCid | Should -Be 'uat-client-id'
    }

    It 'sets $env:DATAVERSE_CLIENT_SECRET from cfg before CLI steps' {
        $script:envCapSecret | Should -Be 'uat-secret'
    }

    It 'sets $env:DATAVERSE_TENANT_ID from cfg before CLI steps' {
        $script:envCapTenant | Should -Be 'uat-tenant'
    }
}
