#Requires -Version 7
<#
  Tests for Publish-PpCodeApp (Public cmdlet).
  WHY each test exists is documented inline.
  All npm, power-apps push, and pac calls are mocked — nothing real runs.
#>

BeforeAll {
    $RepoRoot     = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
    $ManifestPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1'
    Import-Module $ManifestPath -Force
}

Describe 'Publish-PpCodeApp — parameter contract' {

    It '-Environment is Mandatory' {
        # WHY: Without a mandatory Environment the cmdlet would use no .env file and
        # silently attempt to write a power.config.json with null fields, deploying the
        # app to the wrong (or no) environment. Enforce at parameter level.
        $param = (Get-Command Publish-PpCodeApp).Parameters['Environment']
        $isMandatory = $param.Attributes | Where-Object { $_ -is [System.Management.Automation.ParameterAttribute] } |
                        Select-Object -ExpandProperty Mandatory
        $isMandatory | Should -BeTrue
    }
}

Describe 'Publish-PpCodeApp — -WhatIf suppresses all side effects' {

    BeforeAll {
        # WHY: -WhatIf is the operator safety net. Under -WhatIf:
        #   - power.config.json must NOT be written (would clobber the checked-in file)
        #   - npm build must NOT run (unnecessary slow build, could fail in dry-run CI)
        #   - power-apps push must NOT run (would actually push to Power Apps)
        # All three are state-mutating. This test guards the SupportsShouldProcess contract.

        $script:FakeCfg = @{
            Url               = 'https://dev.crm.dynamics.com'
            ClientId          = 'fake-client-id'
            ClientSecret      = 'fake-secret'
            TenantId          = 'fake-tenant'
            APP_ID            = 'app-abc-123'
            APP_DISPLAY_NAME  = 'Enmax AutoCAD Dev'
            ENVIRONMENT_ID    = 'env-def-456'
        }

        Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig    { return $script:FakeCfg }
        Mock -ModuleName PowerPlatform.Deploy Connect-PpDataverse {}
        Mock -ModuleName PowerPlatform.Deploy Assert-PpExitCode  {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpNpm            {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpPowerAppsPush  {}
    }

    It 'does not call Invoke-PpNpm under -WhatIf' {
        Publish-PpCodeApp -Environment dev -WhatIf 2>$null

        Should -Invoke Invoke-PpNpm -ModuleName PowerPlatform.Deploy -Times 0
    }

    It 'does not call Invoke-PpPowerAppsPush under -WhatIf' {
        Publish-PpCodeApp -Environment dev -WhatIf 2>$null

        Should -Invoke Invoke-PpPowerAppsPush -ModuleName PowerPlatform.Deploy -Times 0
    }

    It 'does not call Assert-PpExitCode for build or push under -WhatIf' {
        # WHY: If no npm or power-apps commands run, Assert-PpExitCode must not be called
        # for those operations either (calling it would check $LASTEXITCODE from a previous
        # unrelated command, potentially raising a false failure).
        Publish-PpCodeApp -Environment dev -WhatIf 2>$null

        Should -Invoke Assert-PpExitCode -ModuleName PowerPlatform.Deploy -Times 0 -ParameterFilter {
            $Operation -eq 'npm run build' -or $Operation -eq 'power-apps push'
        }
    }
}

Describe 'Publish-PpCodeApp — normal run (mocked)' {

    BeforeAll {
        # WHY: Verify the happy-path wires each seam in the correct order:
        # pac auth → config write → npm build → push. Each mock asserts a contract boundary.

        $script:FakeCfg2 = @{
            Url               = 'https://dev.crm.dynamics.com'
            ClientId          = 'fake-client-id'
            ClientSecret      = 'fake-secret'
            TenantId          = 'fake-tenant'
            APP_ID            = 'app-abc-123'
            APP_DISPLAY_NAME  = 'Enmax AutoCAD Dev'
            ENVIRONMENT_ID    = 'env-def-456'
        }

        Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig    { return $script:FakeCfg2 }
        Mock -ModuleName PowerPlatform.Deploy Connect-PpDataverse {}
        Mock -ModuleName PowerPlatform.Deploy Assert-PpExitCode  {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpNpm            {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpPowerAppsPush  {}
        # Suppress the real power.config.json write — the normal-run path now resolves
        # to the actual code-app dir, so without this mock the test would write a
        # (gitignored) file as a side effect.
        Mock -ModuleName PowerPlatform.Deploy Set-Content        {}
    }

    It 'calls Connect-PpDataverse with the Environment' {
        # WHY: pac auth must precede the push. Skipping auth leaves pac with no active
        # profile and causes power-apps push to fail with a cryptic auth error.
        Publish-PpCodeApp -Environment dev

        Should -Invoke Connect-PpDataverse -ModuleName PowerPlatform.Deploy -ParameterFilter {
            $Environment -eq 'dev'
        }
    }

    It 'calls Invoke-PpNpm with run build arguments' {
        # WHY: The push step requires a pre-built dist/ artefact. If npm build is skipped
        # or passed wrong args the push deploys a stale or missing bundle.
        Publish-PpCodeApp -Environment dev

        Should -Invoke Invoke-PpNpm -ModuleName PowerPlatform.Deploy -ParameterFilter {
            $Arguments -contains 'run' -and $Arguments -contains 'build'
        }
    }

    It 'calls Invoke-PpPowerAppsPush' {
        # WHY: If the push seam is not called the app is never actually deployed —
        # the build ran but the artefact stayed local.
        Publish-PpCodeApp -Environment dev

        Should -Invoke Invoke-PpPowerAppsPush -ModuleName PowerPlatform.Deploy -Times 1
    }

    It 'calls Assert-PpExitCode after npm build (fail-loud, Rule 12)' {
        # WHY: A non-zero npm exit code must surface as a thrown error. If silently
        # swallowed, power-apps push would try to deploy an incomplete dist/.
        Publish-PpCodeApp -Environment dev

        Should -Invoke Assert-PpExitCode -ModuleName PowerPlatform.Deploy -ParameterFilter {
            $Operation -eq 'npm run build'
        }
    }

    It 'calls Assert-PpExitCode after power-apps push (fail-loud, Rule 12)' {
        # WHY: A failed push (network error, auth expiry, etc.) must not be silently
        # swallowed — the deployment must be retried with accurate failure feedback.
        Publish-PpCodeApp -Environment dev

        Should -Invoke Assert-PpExitCode -ModuleName PowerPlatform.Deploy -ParameterFilter {
            $Operation -eq 'power-apps push'
        }
    }
}

Describe 'Publish-PpCodeApp — power.config content (Get-PpCodeAppConfig)' {

    # WHY: The dataSources map is consumed by the Power Apps runtime to resolve
    # Dataverse entity bindings. A missing or misnamed key causes silent binding
    # failures in the deployed app (the affected list/grid shows no data but no error).
    # Testing the pure config-builder function in isolation means a regression is
    # caught before any build/push runs.

    BeforeAll {
        $script:FakeCfg3 = @{
            APP_ID           = 'app-abc-123'
            APP_DISPLAY_NAME = 'Test App'
            ENVIRONMENT_ID   = 'env-def-456'
        }
    }

    It 'includes systemusers in dataSources (required for user lookups)' {
        InModuleScope PowerPlatform.Deploy -Parameters @{ Cfg = $script:FakeCfg3 } {
            $config = Get-PpCodeAppConfig -Cfg $Cfg
            $config.databaseReferences.'default.cds'.dataSources.ContainsKey('systemusers') | Should -BeTrue
        }
    }

    It 'includes teams in dataSources (required for team/owner lookups)' {
        InModuleScope PowerPlatform.Deploy -Parameters @{ Cfg = $script:FakeCfg3 } {
            $config = Get-PpCodeAppConfig -Cfg $Cfg
            $config.databaseReferences.'default.cds'.dataSources.ContainsKey('teams') | Should -BeTrue
        }
    }

    It 'includes enmax_autocadreservations in dataSources' {
        InModuleScope PowerPlatform.Deploy -Parameters @{ Cfg = $script:FakeCfg3 } {
            $config = Get-PpCodeAppConfig -Cfg $Cfg
            $config.databaseReferences.'default.cds'.dataSources.ContainsKey('enmax_autocadreservations') | Should -BeTrue
        }
    }

    It 'includes enmax_autocadappconfigs in dataSources (required for App Configuration table)' {
        # WHY (Rule 15): The Code App reads ALL configuration from the App Configuration table.
        # If this data source binding is absent, config reads will silently return null and the
        # app will behave as if no configuration exists.
        InModuleScope PowerPlatform.Deploy -Parameters @{ Cfg = $script:FakeCfg3 } {
            $config = Get-PpCodeAppConfig -Cfg $Cfg
            $config.databaseReferences.'default.cds'.dataSources.ContainsKey('enmax_autocadappconfigs') | Should -BeTrue
        }
    }

    It 'contains exactly 23 dataSources entries' {
        # WHY: The count encodes the full expected set. If an entry is accidentally removed
        # the binding breaks silently in the deployed app; if one is added without this test
        # being updated the reviewer is prompted to verify the intent.
        InModuleScope PowerPlatform.Deploy -Parameters @{ Cfg = $script:FakeCfg3 } {
            $config = Get-PpCodeAppConfig -Cfg $Cfg
            $config.databaseReferences.'default.cds'.dataSources.Count | Should -Be 23
        }
    }

    It 'sets the appId from cfg APP_ID' {
        InModuleScope PowerPlatform.Deploy -Parameters @{ Cfg = $script:FakeCfg3 } {
            $config = Get-PpCodeAppConfig -Cfg $Cfg
            $config.appId | Should -Be 'app-abc-123'
        }
    }

    It 'sets environmentId from cfg ENVIRONMENT_ID' {
        InModuleScope PowerPlatform.Deploy -Parameters @{ Cfg = $script:FakeCfg3 } {
            $config = Get-PpCodeAppConfig -Cfg $Cfg
            $config.environmentId | Should -Be 'env-def-456'
        }
    }
}
