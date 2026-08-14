#Requires -Version 7.0
<#
.SYNOPSIS
    Automated validation for every workflows/wf-*/workflow.json definition.
.DESCRIPTION
    This formalizes checks that were, until now, run manually every time a
    workflow was edited this session (see PLAN.md's evidence log) - JSON
    validity, the undocumented ~1024-char action description limit (see
    docs/operations/runbook.md - exceeding it does NOT fail deployment
    visibly, the runtime silently serves the previous version instead),
    and runAfter graph integrity (every runAfter reference must point to
    an action that actually exists in the same scope tree).

    Pure, offline tests - reads workflow.json files from disk only, no
    live Azure state, no `az` CLI calls.
#>

BeforeAll {
    $script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $script:WorkflowsDir = Join-Path $script:RepoRoot 'workflows'
    $script:WorkflowFiles = Get-ChildItem -Path $script:WorkflowsDir -Filter 'workflow.json' -Recurse

    function Get-AllActionNames {
        param($DefinitionObj)
        $names = [System.Collections.Generic.HashSet[string]]::new()
        function Walk($obj) {
            if ($null -eq $obj) { return }
            if ($obj -is [System.Management.Automation.PSCustomObject]) {
                $props = $obj.PSObject.Properties
                if ($props.Name -contains 'actions' -and $obj.actions -is [System.Management.Automation.PSCustomObject]) {
                    foreach ($actionProp in $obj.actions.PSObject.Properties) {
                        [void]$names.Add($actionProp.Name)
                        Walk $actionProp.Value
                    }
                }
                if ($props.Name -contains 'else') {
                    Walk $obj.else
                }
            }
        }
        Walk $DefinitionObj
        return $names
    }

    function Get-RunAfterProblems {
        param($DefinitionObj, [System.Collections.Generic.HashSet[string]]$AllNames)
        $problems = [System.Collections.Generic.List[string]]::new()
        function Walk($obj, $path) {
            if ($null -eq $obj) { return }
            if ($obj -is [System.Management.Automation.PSCustomObject]) {
                $props = $obj.PSObject.Properties
                if ($props.Name -contains 'actions' -and $obj.actions -is [System.Management.Automation.PSCustomObject]) {
                    foreach ($actionProp in $obj.actions.PSObject.Properties) {
                        $action = $actionProp.Value
                        $actionPath = "$path/$($actionProp.Name)"
                        if ($action.PSObject.Properties.Name -contains 'runAfter' -and $action.runAfter) {
                            foreach ($refProp in $action.runAfter.PSObject.Properties) {
                                if (-not $AllNames.Contains($refProp.Name)) {
                                    $problems.Add("$actionPath runAfter references missing action '$($refProp.Name)'")
                                }
                            }
                        }
                        Walk $action $actionPath
                    }
                }
                if ($props.Name -contains 'else') {
                    Walk $obj.else "$path/else"
                }
            }
        }
        Walk $DefinitionObj ''
        return $problems
    }

    function Get-OverLimitDescriptions {
        param($Node, [int]$Limit = 1024)
        $results = [System.Collections.Generic.List[object]]::new()
        function Walk($obj, $path) {
            if ($null -eq $obj) { return }
            if ($obj -is [System.Management.Automation.PSCustomObject]) {
                foreach ($p in $obj.PSObject.Properties) {
                    if ($p.Name -eq 'description' -and $p.Value -is [string] -and $p.Value.Length -gt $Limit) {
                        $results.Add([pscustomobject]@{ Path = $path; Length = $p.Value.Length })
                    }
                    Walk $p.Value "$path.$($p.Name)"
                }
            } elseif ($obj -is [System.Collections.IEnumerable] -and $obj -isnot [string]) {
                $i = 0
                foreach ($item in $obj) {
                    Walk $item "$path[$i]"
                    $i++
                }
            }
        }
        Walk $Node ''
        return $results
    }
}

Describe 'Workflow JSON definitions' {

    It 'discovers at least one workflow.json file' {
        $script:WorkflowFiles.Count | Should -BeGreaterThan 0
    }

    Context 'Each workflow file' {
        BeforeDiscovery {
            $workflowPaths = (Get-ChildItem -Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'workflows') -Filter 'workflow.json' -Recurse) |
                ForEach-Object { $_.FullName }
        }

        It 'is valid JSON: <_>' -ForEach $workflowPaths {
            { Get-Content -Path $_ -Raw | ConvertFrom-Json -Depth 100 } | Should -Not -Throw
        }

        It 'has no action description over 1024 characters: <_>' -ForEach $workflowPaths {
            $json = Get-Content -Path $_ -Raw | ConvertFrom-Json -Depth 100
            $overLimit = Get-OverLimitDescriptions -Node $json.definition
            if ($overLimit.Count -gt 0) {
                $detail = ($overLimit | ForEach-Object { "$($_.Path) ($($_.Length) chars)" }) -join '; '
                throw "Description(s) over 1024 chars: $detail"
            }
        }

        It 'has no dangling runAfter references: <_>' -ForEach $workflowPaths {
            $json = Get-Content -Path $_ -Raw | ConvertFrom-Json -Depth 100
            $allNames = Get-AllActionNames -DefinitionObj $json.definition
            $problems = Get-RunAfterProblems -DefinitionObj $json.definition -AllNames $allNames
            if ($problems.Count -gt 0) {
                throw ($problems -join '; ')
            }
        }

        It 'declares the required top-level workflow schema: <_>' -ForEach $workflowPaths {
            $json = Get-Content -Path $_ -Raw | ConvertFrom-Json -Depth 100
            $json.kind | Should -Be 'Stateful'
            $json.definition.'$schema' | Should -Not -BeNullOrEmpty
            $json.definition.triggers | Should -Not -BeNullOrEmpty
            $json.definition.actions | Should -Not -BeNullOrEmpty
        }
    }

    Context 'wf-copy-invoices (the shared engine) - specific invariants' {
        BeforeAll {
            $script:EnginePath = Join-Path $script:WorkflowsDir 'wf-copy-invoices/workflow.json'
            $script:Engine = Get-Content -Path $script:EnginePath -Raw | ConvertFrom-Json -Depth 100
        }

        It 'requires triggerType on its manual trigger' {
            $script:Engine.definition.triggers.manual.inputs.schema.required | Should -Contain 'triggerType'
        }

        It 'does NOT require triggeringWorkflow (must stay backward compatible - ADR-0027)' {
            $script:Engine.definition.triggers.manual.inputs.schema.required | Should -Not -Contain 'triggeringWorkflow'
        }

        It 'limits concurrency to 1 run at a time' {
            $script:Engine.definition.triggers.manual.runtimeConfiguration.concurrency.runs | Should -Be 1
        }

        It 'has a Response action configured as asynchronous (required for a concurrency-limited trigger)' {
            $script:Engine.definition.actions.Response.operationOptions | Should -Be 'asynchronous'
        }

        It 'writes a FileRunEvents row for every terminal per-file outcome' {
            $engineText = Get-Content -Path $script:EnginePath -Raw
            # 5 non-folder terminal branches: Skipped-terminal, Abandoned-invalid, Copied, Abandoned, Failed
            (Select-String -InputObject $engineText -Pattern '"tableName":\s*"FileRunEvents"' -AllMatches).Matches.Count | Should -Be 5
        }
    }

    Context 'Trigger gating - kill-switch casing tolerance (regression test)' {
        It 'wf-scheduled-copy tolerates both capitalized and lowercase app-setting boolean values' {
            $path = Join-Path $script:WorkflowsDir 'wf-scheduled-copy/workflow.json'
            $text = Get-Content -Path $path -Raw
            # Real incident: Bicep's string(bool) produces "True"/"False" while
            # `az logicapp config appsettings set` produces lowercase - the
            # expression must call toLower() on the coalesced value.
            $text | Should -Match "toLower\(coalesce\(appsetting\('SCHEDULED_TRIGGER_ENABLED'\)"
        }
    }

    Context 'wf-file-trigger-copy must not exist (removed - ADR-0016)' {
        It 'has no wf-file-trigger-copy folder' {
            (Join-Path $script:WorkflowsDir 'wf-file-trigger-copy') | Should -Not -Exist
        }

        It 'no workflow still references FILE_TRIGGER_ENABLED' {
            $matches = Select-String -Path (Join-Path $script:WorkflowsDir '*/workflow.json') -Pattern 'FILE_TRIGGER_ENABLED' -ErrorAction SilentlyContinue
            $matches | Should -BeNullOrEmpty
        }
    }

    Context 'Digest CSV columns include TriggeredByWorkflow (ADR-0027)' {
        It 'wf-daily-digest CSV header includes TriggeredByWorkflow' {
            $text = Get-Content -Path (Join-Path $script:WorkflowsDir 'wf-daily-digest/workflow.json') -Raw
            $text | Should -Match 'TriggerType,TriggeredByWorkflow,LastAttemptUtc'
        }

        It 'wf-run-digest CSV header includes TriggeredByWorkflow' {
            $text = Get-Content -Path (Join-Path $script:WorkflowsDir 'wf-run-digest/workflow.json') -Raw
            $text | Should -Match 'TriggerType,TriggeredByWorkflow,LastAttemptUtc'
        }
    }
}
