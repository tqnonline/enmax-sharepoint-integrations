#Requires -Version 7
<#
  Tests for Connect-PpDataverse (Public cmdlet).
  WHY each test exists is documented inline.
  All pac CLI calls are mocked — the real pac binary is never invoked.
#>

BeforeAll {
    $RepoRoot     = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
    $ManifestPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1'
    Import-Module $ManifestPath -Force
}

Describe 'Connect-PpDataverse' {

    BeforeAll {
        # Shared fake config — what Get-PpEnvConfig would return for 'dev'
        $script:FakeCfg = @{
            Url          = 'https://dev.crm.dynamics.com'
            ClientId     = 'fake-client-id'
            ClientSecret = 'fake-secret'
            TenantId     = 'fake-tenant'
        }
    }

    Context '-WhatIf suppresses pac auth create' {
        # WHY: -WhatIf is a safety guarantee for state-changing operations. If `pac auth create`
        # runs under -WhatIf it mutates the credential store, violating the PowerShell contract
        # and making dry-run CI checks unsafe.
        BeforeAll {
            Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig { return $script:FakeCfg }
            Mock -ModuleName PowerPlatform.Deploy Invoke-PpPac {
                # auth list returns text containing the URL so no create would happen anyway,
                # but -WhatIf must suppress it even when the URL is absent from the list.
                return 'No profiles found.'
            }
            Mock -ModuleName PowerPlatform.Deploy Assert-PpExitCode {}
        }

        It 'does not call Invoke-PpPac with auth create arguments under -WhatIf' {
            Connect-PpDataverse -Environment dev -WhatIf

            # Specifically assert that no `create` subcommand was issued
            Should -Invoke Invoke-PpPac -ModuleName PowerPlatform.Deploy -Times 0 -ParameterFilter {
                $Arguments -contains 'create'
            }
        }
    }

    Context 'Idempotent — skips create when URL already in auth list' {
        # WHY: Re-running the deploy script (common in CI) must not duplicate auth profiles or
        # attempt a redundant login that might hit rate limits or produce confusing output.
        BeforeAll {
            Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig { return $script:FakeCfg }
            Mock -ModuleName PowerPlatform.Deploy Invoke-PpPac {
                param([string[]]$Arguments)
                if ($Arguments -contains 'list') {
                    # Auth list contains the env URL — already authenticated
                    return "  [1] https://dev.crm.dynamics.com  Active"
                }
                # auth select — return success
                return ''
            }
            Mock -ModuleName PowerPlatform.Deploy Assert-PpExitCode {}
        }

        It 'does not invoke Invoke-PpPac with auth create when URL is already present' {
            Connect-PpDataverse -Environment dev

            Should -Invoke Invoke-PpPac -ModuleName PowerPlatform.Deploy -Times 0 -ParameterFilter {
                $Arguments -contains 'create'
            }
        }

        It 'does invoke Invoke-PpPac with auth select (profile activation still runs)' {
            # WHY: auth select must always run even when create is skipped, so downstream pac
            # commands use the correct profile.
            Connect-PpDataverse -Environment dev

            Should -Invoke Invoke-PpPac -ModuleName PowerPlatform.Deploy -ParameterFilter {
                $Arguments -contains 'select'
            }
        }

        It 'selects the auth profile by parsed index matching the environment URL' {
            # WHY: pac CLI 2.x has no --environment on auth select; parse auth list and
            # pick the profile whose Environment Url matches (not blind --index 1).
            Connect-PpDataverse -Environment dev

            Should -Invoke Invoke-PpPac -ModuleName PowerPlatform.Deploy -ParameterFilter {
                ($Arguments -contains 'select') -and
                ($Arguments -contains '--index') -and
                ($Arguments -contains '1')
            }
            Should -Invoke Invoke-PpPac -ModuleName PowerPlatform.Deploy -Times 0 -ParameterFilter {
                ($Arguments -contains 'select') -and ($Arguments -contains '--environment')
            }
        }
    }

    Context 'First-time auth — creates profile when URL absent from list' {
        # WHY: When the environment has never been authenticated, the profile must be created.
        # Silently skipping the create would leave pac in an unauthenticated state, causing
        # all subsequent pac commands to fail.
        BeforeAll {
            Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig { return $script:FakeCfg }
            Mock -ModuleName PowerPlatform.Deploy Invoke-PpPac {
                param([string[]]$Arguments)
                if ($Arguments -contains 'list') {
                    # Auth list does NOT contain the env URL
                    return 'No profiles found.'
                }
                return ''
            }
            Mock -ModuleName PowerPlatform.Deploy Assert-PpExitCode {}
        }

        It 'invokes Invoke-PpPac with auth create arguments' {
            Connect-PpDataverse -Environment dev

            Should -Invoke Invoke-PpPac -ModuleName PowerPlatform.Deploy -ParameterFilter {
                $Arguments -contains 'create'
            }
        }

        It 'passes the correct URL to pac auth create' {
            Connect-PpDataverse -Environment dev

            Should -Invoke Invoke-PpPac -ModuleName PowerPlatform.Deploy -ParameterFilter {
                $Arguments -contains 'create' -and $Arguments -contains 'https://dev.crm.dynamics.com'
            }
        }

        It 'calls Assert-PpExitCode after auth create' {
            # WHY: Fail-loud (Rule 12) — a non-zero pac exit must surface as a thrown error,
            # not be silently swallowed.
            Connect-PpDataverse -Environment dev

            Should -Invoke Assert-PpExitCode -ModuleName PowerPlatform.Deploy -ParameterFilter {
                $Operation -eq 'pac auth create'
            }
        }
    }
}
