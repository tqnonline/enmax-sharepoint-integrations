#Requires -Version 7.0
<#
.SYNOPSIS
    Unit tests for scripts/modules/Inv2Sp.Common.psm1 - the shared helper
    module every deployment/operations script sources.
.DESCRIPTION
    Pure, offline tests only - no `az` CLI calls, no network, no live
    Azure state. Anything that needs a live `az` session belongs in a
    manual verification step (see docs/operations/runbook.md), not here -
    these tests must be able to run in a plain CI runner with no Azure
    credentials at all.
#>

BeforeAll {
    $script:ModulePath = Join-Path $PSScriptRoot '../scripts/modules/Inv2Sp.Common.psm1'
    Import-Module $script:ModulePath -Force
}

Describe 'Inv2Sp.Common module' {

    Context 'Get-Inv2SpEnvironmentConfig' {
        It 'returns a config for dev with all required keys populated' {
            $config = Get-Inv2SpEnvironmentConfig -Environment dev
            $config | Should -Not -BeNullOrEmpty
            $config.EnvironmentCode | Should -Be 'T'
            $config.SubscriptionId | Should -Not -BeNullOrEmpty
            $config.ResourceGroup | Should -Be 'RG-ENMAX-COR-UW2-INV2SP-T'
            $config.LogicAppName | Should -Be 'LA-ENMAX-COR-UW2-INV2SP-T'
            $config.StorageAccountName | Should -Be 'stenmaxcoruw2inv2spt'
            $config.KeyVaultName | Should -Not -BeNullOrEmpty
            $config.BicepParamFile | Should -Be 'infra/params/dev.bicepparam'
        }

        It 'returns a config for prod with all required keys populated' {
            $config = Get-Inv2SpEnvironmentConfig -Environment prod
            $config | Should -Not -BeNullOrEmpty
            $config.EnvironmentCode | Should -Be 'P'
            $config.ResourceGroup | Should -Be 'RG-ENMAX-COR-UW2-INV2SP-P'
            $config.BicepParamFile | Should -Be 'infra/params/prod.bicepparam'
        }

        It 'dev and prod resolve to genuinely different subscriptions' {
            $dev = Get-Inv2SpEnvironmentConfig -Environment dev
            $prod = Get-Inv2SpEnvironmentConfig -Environment prod
            $dev.SubscriptionId | Should -Not -Be $prod.SubscriptionId
            $dev.ResourceGroup | Should -Not -Be $prod.ResourceGroup
        }

        It 'rejects an environment name outside dev/prod' {
            { Get-Inv2SpEnvironmentConfig -Environment 'staging' } | Should -Throw
        }
    }

    Context 'Get-Inv2SpRepoRoot' {
        It 'resolves to the actual repository root' {
            $root = Get-Inv2SpRepoRoot
            (Join-Path $root 'README.md') | Should -Exist
            (Join-Path $root 'workflows') | Should -Exist
            (Join-Path $root 'infra') | Should -Exist
            (Join-Path $root 'scripts') | Should -Exist
        }
    }

    Context 'Write-Inv2SpLog' {
        It 'does not throw for every supported level' {
            { Write-Inv2SpLog -Message 'test' -Level Info } | Should -Not -Throw
            { Write-Inv2SpLog -Message 'test' -Level Warn } | Should -Not -Throw
            { Write-Inv2SpLog -Message 'test' -Level Error } | Should -Not -Throw
            { Write-Inv2SpLog -Message 'test' -Level Success } | Should -Not -Throw
        }

        It 'rejects a level outside the supported set' {
            { Write-Inv2SpLog -Message 'test' -Level 'Debug' } | Should -Throw
        }
    }

    Context 'ConvertFrom-SecureStringPlain' {
        It 'round-trips a plaintext value through a SecureString correctly' {
            $plain = 'correct-horse-battery-staple'
            $secure = ConvertTo-SecureString -String $plain -AsPlainText -Force
            $result = $secure | ConvertFrom-SecureStringPlain
            $result | Should -Be $plain
        }

        It 'handles a single-character value without throwing' {
            $secure = ConvertTo-SecureString -String 'x' -AsPlainText -Force
            { $secure | ConvertFrom-SecureStringPlain } | Should -Not -Throw
        }
    }
}
