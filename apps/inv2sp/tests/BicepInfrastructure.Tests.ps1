#Requires -Version 7.0
<#
.SYNOPSIS
    Static validation tests for the Bicep infrastructure.
.DESCRIPTION
    `az bicep build` is a purely local compile step - no Azure login or
    live connectivity required, safe to run in any CI runner. This is
    intentionally NOT a `what-if` test (that requires live Azure
    credentials and a real resource group) - live deployment preview
    remains a manual step, see docs/operations/scripts-reference.md.

    Also includes static regression checks for specific decisions that
    were previously found broken/regressed live (see the referenced ADRs)
    - these are "does the source still say what we decided it should say"
    checks, not behavioral tests.
#>

BeforeAll {
    $script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $script:InfraDir = Join-Path $script:RepoRoot 'infra'
    $script:MainBicep = Join-Path $script:InfraDir 'main.bicep'
}

Describe 'Bicep infrastructure' {

    Context 'Compilation' {
        It 'main.bicep compiles cleanly (az bicep build)' {
            $output = az bicep build --file $script:MainBicep --stdout 2>&1
            $LASTEXITCODE | Should -Be 0 -Because "az bicep build output: $output"
        }

        It 'every module under infra/modules compiles cleanly on its own' {
            $moduleFiles = Get-ChildItem -Path (Join-Path $script:InfraDir 'modules') -Filter '*.bicep' -Recurse
            foreach ($file in $moduleFiles) {
                $null = az bicep build --file $file.FullName --stdout 2>&1
                $LASTEXITCODE | Should -Be 0 -Because "$($file.FullName) failed to compile"
            }
        }
    }

    Context 'Storage tables (regression - ADR-0023 added FileRunEvents)' {
        It 'storage.bicep provisions exactly the 4 expected state tables' {
            $content = Get-Content -Path (Join-Path $script:InfraDir 'modules/storage.bicep') -Raw
            $content | Should -Match "'ProcessedFiles'"
            $content | Should -Match "'RunLog'"
            $content | Should -Match "'AlertState'"
            $content | Should -Match "'FileRunEvents'"
        }

        It 'allowSharedKeyAccess is always true (platform constraint, not a hardening toggle - see ADR-0007)' {
            $content = Get-Content -Path (Join-Path $script:InfraDir 'modules/storage.bicep') -Raw
            $content | Should -Match 'allowSharedKeyAccess:\s*true'
        }
    }

    Context 'RBAC scope (regression - ADR-0015, trimmed from an earlier broader grant)' {
        BeforeAll {
            # Strip comment lines first - the module's header comment
            # deliberately DOCUMENTS the rejected broader role set by name
            # ("corrected from an earlier draft that also granted Storage
            # Blob Data Owner...") as an explanation of what was removed and
            # why - a naive whole-file text match would false-positive on
            # that explanatory comment. Only actual code lines matter here.
            $rawContent = Get-Content -Path (Join-Path $script:InfraDir 'modules/rbac.bicep')
            $script:RbacCodeOnly = ($rawContent | Where-Object { $_.TrimStart() -notmatch '^//' }) -join "`n"
        }

        It 'grants only Storage Table Data Contributor to the Logic App managed identity' {
            $script:RbacCodeOnly | Should -Match 'storageTableDataContributor'
            # Regression guard: the originally-drafted, over-broad role set
            # should never reappear in actual (non-comment) code.
            $script:RbacCodeOnly | Should -Not -Match 'Storage Blob Data Owner'
            $script:RbacCodeOnly | Should -Not -Match 'Storage Queue Data Contributor'
            $script:RbacCodeOnly | Should -Not -Match 'Storage Account Contributor'
            $script:RbacCodeOnly | Should -Not -Match 'Monitoring Metrics Publisher'
        }
    }

    Context 'Key Vault access policy (regression - trimmed from get+list to get only)' {
        It 'grants only get on secrets to the managed identity' {
            $content = Get-Content -Path (Join-Path $script:InfraDir 'modules/keyVaultAccessPolicy.bicep') -Raw
            $content | Should -Match "'get'"
            $content | Should -Not -Match "'list'"
        }
    }

    Context 'Monitoring (regression - ADR-0012 dimension split, ADR-0021 threshold)' {
        BeforeAll {
            $script:MonitoringContent = Get-Content -Path (Join-Path $script:InfraDir 'modules/monitoring.bicep') -Raw
        }

        It 'trigger and run failure alerts are dimensioned by workflowName' {
            ($script:MonitoringContent | Select-String -Pattern "name:\s*'workflowName'" -AllMatches).Matches.Count | Should -BeGreaterOrEqual 2
        }

        It 'only allows a legal metricAlert windowSize for the dead-man switch (1, 6, or 12 hours)' {
            # Bicep multi-line array literals are newline-separated, no
            # commas: @allowed([\n  1\n  6\n  12\n]) - not a comma-separated
            # single-line list.
            $script:MonitoringContent | Should -Match '@allowed\(\[\s*1\s*,?\s*6\s*,?\s*12\s*\]\)'
        }
    }

    Context 'Gateway connectivity (regression - ADR-0006)' {
        It 'logicApp.bicep explicitly sets vnetRouteAllEnabled to false' {
            $content = Get-Content -Path (Join-Path $script:InfraDir 'modules/logicApp.bicep') -Raw
            $content | Should -Match 'vnetRouteAllEnabled:\s*false'
        }
    }

    Context 'Connection kind (regression - ADR-0004, V1 cannot support accessPolicy)' {
        It 'office365 and sharePointOnline connections are provisioned as V2 kind' {
            $office365 = Get-Content -Path (Join-Path $script:InfraDir 'modules/connections/office365.bicep') -Raw
            $sharePoint = Get-Content -Path (Join-Path $script:InfraDir 'modules/connections/sharePointOnline.bicep') -Raw
            $office365 | Should -Match "kind:\s*'V2'"
            $sharePoint | Should -Match "kind:\s*'V2'"
        }
    }

    Context 'Per-environment parameter files' {
        BeforeDiscovery {
            $paramFiles = @('infra/params/dev.bicepparam', 'infra/params/prod.bicepparam') |
                ForEach-Object { Join-Path (Split-Path $PSScriptRoot -Parent) $_ }
        }

        It 'exists and is non-empty: <_>' -ForEach $paramFiles {
            $_ | Should -Exist
            (Get-Content -Path $_ -Raw).Length | Should -BeGreaterThan 0
        }
    }
}
