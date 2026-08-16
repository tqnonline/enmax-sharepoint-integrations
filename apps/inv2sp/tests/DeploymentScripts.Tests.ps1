#Requires -Version 7.0
<#
.SYNOPSIS
    Validation tests for every scripts/*.ps1 deployment/operations script.
.DESCRIPTION
    Static, offline checks only - AST parse validity, PSScriptAnalyzer
    (Error severity - Warning-level findings like PSAvoidUsingWriteHost
    are an accepted, deliberate convention in this repo for interactive
    console tooling, not a defect), and parameter contract checks (every
    script that takes -Environment must constrain it to dev/prod, every
    destructive script must support -WhatIf/-Force). No `az` CLI calls -
    these tests must run with no Azure credentials at all.
#>

BeforeAll {
    $script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $script:ScriptsDir = Join-Path $script:RepoRoot 'scripts'
    $script:AllScripts = Get-ChildItem -Path $script:ScriptsDir -Filter '*.ps1'

    # Scripts that operate against a specific environment and must
    # constrain -Environment to the two real environment names.
    $script:EnvironmentScoped = @(
        'Deploy-All.ps1', 'Deploy-Infrastructure.ps1', 'Deploy-Workflows.ps1',
        'Enable-Triggers.ps1', 'Invoke-OnDemandRun.ps1', 'Invoke-PimActivation.ps1',
        'Reset-AbandonedFiles.ps1', 'Clear-FileRunEvents.ps1', 'Set-KeyVaultSecrets.ps1',
        'Test-Connections.ps1', 'Test-Prerequisites.ps1'
    )

    # Scripts that perform a permanent/destructive/state-changing action
    # and must therefore support ShouldProcess (-WhatIf/-Confirm) or an
    # explicit -Force override (see docs/operations/runbook.md's note on
    # -Confirm:$false not reliably suppressing ShouldProcess in this
    # environment - every destructive script exposes -Force explicitly).
    $script:DestructiveScripts = @(
        'Reset-AbandonedFiles.ps1', 'Clear-FileRunEvents.ps1',
        'Deploy-Infrastructure.ps1', 'Deploy-Workflows.ps1', 'Deploy-All.ps1',
        'Enable-Triggers.ps1'
    )
}

Describe 'Deployment and operations scripts' {

    It 'discovers at least one script' {
        $script:AllScripts.Count | Should -BeGreaterThan 0
    }

    Context 'Each script' {
        BeforeDiscovery {
            $scriptPaths = (Get-ChildItem -Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts') -Filter '*.ps1') |
                ForEach-Object { $_.FullName }
        }

        It 'parses as valid PowerShell (AST): <_>' -ForEach $scriptPaths {
            $errors = $null
            [System.Management.Automation.Language.Parser]::ParseFile($_, [ref]$null, [ref]$errors) | Out-Null
            $errors.Count | Should -Be 0
        }

        It 'has no PSScriptAnalyzer Error-severity findings: <_>' -ForEach $scriptPaths {
            $results = Invoke-ScriptAnalyzer -Path $_ -Severity Error
            if ($results) {
                $detail = ($results | ForEach-Object { "Line $($_.Line): $($_.RuleName) - $($_.Message)" }) -join '; '
                throw "PSScriptAnalyzer Error-severity findings: $detail"
            }
        }
    }

    Context 'Environment-scoped scripts' {
        BeforeDiscovery {
            $envScopedPaths = @(
                'Deploy-All.ps1', 'Deploy-Infrastructure.ps1', 'Deploy-Workflows.ps1',
                'Enable-Triggers.ps1', 'Invoke-OnDemandRun.ps1', 'Invoke-PimActivation.ps1',
                'Reset-AbandonedFiles.ps1', 'Clear-FileRunEvents.ps1', 'Set-KeyVaultSecrets.ps1',
                'Test-Connections.ps1', 'Test-Prerequisites.ps1'
            ) | ForEach-Object { Join-Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts') $_ }
        }

        It 'constrains -Environment to dev/prod via ValidateSet: <_>' -ForEach $envScopedPaths {
            $tokens = $null
            $ast = [System.Management.Automation.Language.Parser]::ParseFile($_, [ref]$tokens, [ref]$null)
            $paramBlock = $ast.ParamBlock
            $paramBlock | Should -Not -BeNullOrEmpty
            $envParam = $paramBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -eq 'Environment' }
            $envParam | Should -Not -BeNullOrEmpty
            $validateSetAttr = $envParam.Attributes | Where-Object { $_.TypeName.Name -eq 'ValidateSet' }
            $validateSetAttr | Should -Not -BeNullOrEmpty
            $values = $validateSetAttr.PositionalArguments.Value
            $values | Should -Contain 'dev'
            $values | Should -Contain 'prod'
        }
    }

    Context 'Destructive scripts' {
        BeforeDiscovery {
            $destructivePaths = @(
                'Reset-AbandonedFiles.ps1', 'Clear-FileRunEvents.ps1',
                'Deploy-Infrastructure.ps1', 'Deploy-Workflows.ps1', 'Deploy-All.ps1',
                'Enable-Triggers.ps1'
            ) | ForEach-Object { Join-Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts') $_ }
        }

        It 'supports ShouldProcess or an explicit -Force switch: <_>' -ForEach $destructivePaths {
            $content = Get-Content -Path $_ -Raw
            $hasShouldProcess = $content -match 'SupportsShouldProcess'
            $hasForce = $content -match '\[switch\]\$Force'
            ($hasShouldProcess -or $hasForce) | Should -BeTrue -Because "$_ performs a state-changing/destructive action and must have a safety gate"
        }
    }

    Context 'Clear-FileRunEvents.ps1 - parameter set safety (permanent delete, precision matters)' {
        BeforeAll {
            $script:ClearScriptPath = Join-Path $script:ScriptsDir 'Clear-FileRunEvents.ps1'
            $tokens = $null
            $script:ClearScriptAst = [System.Management.Automation.Language.Parser]::ParseFile($script:ClearScriptPath, [ref]$tokens, [ref]$null)
        }

        It 'has mutually exclusive -OlderThanMonths and -Month parameter sets' {
            $content = Get-Content -Path $script:ClearScriptPath -Raw
            $content | Should -Match "ParameterSetName = 'Retention'"
            $content | Should -Match "ParameterSetName = 'ExactMonth'"
        }

        It 'validates -Month against a yyyy-MM pattern' {
            $content = Get-Content -Path $script:ClearScriptPath -Raw
            $content | Should -Match "ValidatePattern\('\^\\d\{4\}-"
        }

        It 'constrains -OlderThanMonths to a sane range' {
            $content = Get-Content -Path $script:ClearScriptPath -Raw
            $content | Should -Match 'ValidateRange\(1,\s*120\)'
        }
    }
}
