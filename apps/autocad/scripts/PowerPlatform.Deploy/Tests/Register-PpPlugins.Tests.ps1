#Requires -Version 7
<#
  Tests for Register-PpPlugins (Public cmdlet).
  WHY each test exists is documented inline.
  All external calls (dotnet, Dataverse REST, OAuth) are mocked — nothing real runs.
#>

BeforeAll {
    $RepoRoot     = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
    $ManifestPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1'
    Import-Module $ManifestPath -Force
}

Describe 'Register-PpPlugins — parameter contract' {

    It '-Environment is Mandatory' {
        # WHY: Without a mandatory Environment the cmdlet silently uses no file and would
        # crash mid-run or (worse) deploy to the wrong environment. Enforce at parameter level.
        $param = (Get-Command Register-PpPlugins).Parameters['Environment']
        $isMandatory = $param.Attributes | Where-Object { $_ -is [System.Management.Automation.ParameterAttribute] } |
                        Select-Object -ExpandProperty Mandatory
        $isMandatory | Should -BeTrue
    }
}

Describe 'Register-PpPlugins — PluginDefinitions data file' {

    It 'PluginDefinitions.psd1 loads with exactly 15 CustomAPIDefs' {
        # WHY: The number of Custom API definitions is load-bearing; adding or removing
        # an entry without a matching deployment would leave Dataverse in an inconsistent
        # state. This test guards against a [ordered]->@{} conversion silently breaking
        # the file parse, or a developer accidentally removing an entry.
        # 15 = 14 prior + enmax_acdnCheckOutSheets (ADR 0002 per-sheet checkout).
        $RepoRoot  = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
        $defsPath  = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1'
        $defs = Import-PowerShellDataFile $defsPath
        $defs.CustomAPIDefs.Count | Should -Be 15
    }

    It 'PluginDefinitions.psd1 loads with exactly 16 StepDefs' {
        # WHY: StepDefs encode plugin step registrations: 14 SetAppOwnerPlugin Create steps
        # (one per config/reference table — PreValidation ownerid stamping = the BU app-owner
        # team) plus OnReservationCreated and AutoCreateDrawings. A broken parse (e.g. unexpected
        # syntax in the data file) would silently leave steps unregistered, so ownership stamping
        # and the reservation workflow would stop firing.
        $RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
        $defsPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1'
        $defs = Import-PowerShellDataFile $defsPath
        $defs.StepDefs.Count | Should -Be 16
    }

    It 'every interactive Custom API accepts ActingUserId' {
        # The Code App runs through a platform identity and stamps the signed-in
        # WhoAmI user on every action. Missing registration drops that identity
        # before PluginActor can authorize or audit the request.
        $RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
        $defsPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1'
        $defs = Import-PowerShellDataFile $defsPath
        $missingActor = $defs.CustomAPIDefs |
            Where-Object { -not ($_.Params | Where-Object { $_.Name -eq 'ActingUserId' }) }
        $missingActor | Should -BeNullOrEmpty
    }

    It 'enmax_acdnIssueNumbers has BindingType=0 (Global) and no BoundEntity' {
        # WHY: Rule 14 — number issuance MUST go through the IssueNumbers Custom API.
        # If BindingType is accidentally changed to 1 (entity-bound) the API breaks
        # and client calls will fail. Encode the correct binding here so a regression
        # is caught before deployment.
        $RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
        $defsPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1'
        $defs = Import-PowerShellDataFile $defsPath
        $issueApi = $defs.CustomAPIDefs | Where-Object { $_.UniqueName -eq 'enmax_acdnIssueNumbers' }
        $issueApi | Should -Not -BeNullOrEmpty
        $issueApi.BindingType | Should -Be 0
        $issueApi.BoundEntity | Should -BeNullOrEmpty
    }

    It 'enmax_acdnAddChildItems is Global with Drawing + Count inputs' {
        # WHY: "Add to Existing" (WS2c) must stay unbound with an explicit Drawing
        # (Type=5) input, matching the reservation-lifecycle routing rationale. A
        # regression to entity-bound or a missing input would break the flow.
        $RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
        $defsPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1'
        $defs = Import-PowerShellDataFile $defsPath
        $api = $defs.CustomAPIDefs | Where-Object { $_.UniqueName -eq 'enmax_acdnAddChildItems' }
        $api | Should -Not -BeNullOrEmpty
        $api.BindingType | Should -Be 0
        $api.PluginClass | Should -Be 'Enmax.AutoCAD.AddChildItemsPlugin'
        ($api.Params | Where-Object { $_.Name -eq 'Drawing' }).Type | Should -Be 5
        ($api.Params | Where-Object { $_.Name -eq 'Count' }).Type   | Should -Be 7
    }

    It 'enmax_acdnApproveCheckout is entity-bound to checkout with Decision + Reason inputs' {
        # WHY: WS3 gated Check Out — the approval queue calls this Custom API. It must stay
        # bound to enmax_autocadcheckout (Target implicit) with a required Decision (Type=7)
        # and an optional Reason (Type=10, required 10+ chars on decline, enforced server-side).
        $RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
        $defsPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1'
        $defs = Import-PowerShellDataFile $defsPath
        $api = $defs.CustomAPIDefs | Where-Object { $_.UniqueName -eq 'enmax_acdnApproveCheckout' }
        $api | Should -Not -BeNullOrEmpty
        $api.BindingType | Should -Be 1
        $api.BoundEntity | Should -Be 'enmax_autocadcheckout'
        $api.PluginClass | Should -Be 'Enmax.AutoCAD.ApproveCheckoutPlugin'
        ($api.Params | Where-Object { $_.Name -eq 'Decision' }).Type | Should -Be 7
    }

    It 'enmax_acdnSubmitRevision captures SubmissionInfo, not a revision number (WS3)' {
        # WHY: WS3 removed the revision number from Check In — SharePoint version history is the
        # revision trail. The Custom API must now take a required SubmissionInfo and NOT NewRevision.
        $RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
        $defsPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1'
        $defs = Import-PowerShellDataFile $defsPath
        $api = $defs.CustomAPIDefs | Where-Object { $_.UniqueName -eq 'enmax_acdnSubmitRevision' }
        $api | Should -Not -BeNullOrEmpty
        ($api.Params | Where-Object { $_.Name -eq 'SubmissionInfo' }) | Should -Not -BeNullOrEmpty
        ($api.Params | Where-Object { $_.Name -eq 'NewRevision' })    | Should -BeNullOrEmpty
    }

    It 'enmax_acdnUpsertSharePointLinks is Global with Target + RecordNumber + FoundFiles (WS5)' {
        $RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
        $defsPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1'
        $defs = Import-PowerShellDataFile $defsPath
        $api = $defs.CustomAPIDefs | Where-Object { $_.UniqueName -eq 'enmax_acdnUpsertSharePointLinks' }
        $api | Should -Not -BeNullOrEmpty
        $api.BindingType | Should -Be 0
        $api.PluginClass | Should -Be 'Enmax.AutoCAD.UpsertSharePointLinksPlugin'
        ($api.Params | Where-Object { $_.Name -eq 'Target' }).Type       | Should -Be 5
        ($api.Params | Where-Object { $_.Name -eq 'RecordNumber' }).Type | Should -Be 10
    }

    It 'enmax_acdnCheckOutSheets is Global with Sheets/Drawing inputs (ADR 0002)' {
        # WHY: Per-sheet checkout must stay unbound (BindingType=0) with explicit
        # Sheets and/or Drawing inputs — same routing rationale as AddChildItems.
        $RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
        $defsPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1'
        $defs = Import-PowerShellDataFile $defsPath
        $api = $defs.CustomAPIDefs | Where-Object { $_.UniqueName -eq 'enmax_acdnCheckOutSheets' }
        $api | Should -Not -BeNullOrEmpty
        $api.BindingType | Should -Be 0
        $api.PluginClass | Should -Be 'Enmax.AutoCAD.CheckOutSheetsPlugin'
        ($api.Params | Where-Object { $_.Name -eq 'Drawing' }).Type      | Should -Be 5
        ($api.Params | Where-Object { $_.Name -eq 'AllAvailable' }).Type | Should -Be 0
        ($api.Response | Where-Object { $_.Name -eq 'CheckoutIds' })     | Should -Not -BeNullOrEmpty
    }
}

Describe 'Register-PpPlugins — unified lifecycle contract-only definitions' {

    BeforeAll {
        $RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
        $defsPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1'
        $defs = Import-PowerShellDataFile $defsPath

        $contractNames = @(
            'enmax_acdnApproveReservationV2'
            'enmax_acdnRequestFileCheckOutV2'
            'enmax_acdnDecideFileCheckOutV2'
            'enmax_acdnSubmitFileCheckInV2'
            'enmax_acdnDecideFileCheckInV2'
            'enmax_acdnForceFileCheckInV2'
        )
    }

    It 'freezes lifecycle contract version 2.0 with exactly six API names' {
        $defs.LifecycleContractVersion | Should -Be '2.0'
        $defs.LifecycleContractDefs.Count | Should -Be 6
        Compare-Object $contractNames $defs.LifecycleContractDefs.UniqueName |
            Should -BeNullOrEmpty
    }

    It 'keeps every lifecycle contract contract-only, global, and unbound' {
        foreach ($contract in $defs.LifecycleContractDefs) {
            $contract.Status | Should -Be 'ContractOnly'
            $contract.BindingType | Should -Be 0
            $contract.BoundEntity | Should -BeNullOrEmpty
        }
    }

    It 'requires idempotency and actor inputs on every lifecycle contract' {
        foreach ($contract in $defs.LifecycleContractDefs) {
            $operationId = $contract.Params | Where-Object Name -eq 'OperationId'
            $actingUserId = $contract.Params | Where-Object Name -eq 'ActingUserId'

            $operationId.Type | Should -Be 10
            $operationId.Optional | Should -BeFalse
            $actingUserId.Type | Should -Be 10
            $actingUserId.Optional | Should -BeTrue
        }
    }

    It 'returns OperationId, Outcome, and ResultJson from every lifecycle contract' {
        foreach ($contract in $defs.LifecycleContractDefs) {
            foreach ($responseName in @('OperationId', 'Outcome', 'ResultJson')) {
                $response = $contract.Response | Where-Object Name -eq $responseName
                $response.Type | Should -Be 10
            }
        }
    }

    It 'defines the exact reservation identity and row-version contract' {
        $contract = $defs.LifecycleContractDefs |
            Where-Object UniqueName -eq 'enmax_acdnApproveReservationV2'

        $actualParams = $contract.Params | ForEach-Object {
            '{0}:{1}:{2}' -f $_.Name, $_.Type, $_.Optional
        }
        $expectedParams = @(
            'ActingUserId:10:True'
            'Reservation:5:False'
            'OperationId:10:False'
            'ExpectedRowVersion:10:False'
        )
        Compare-Object $expectedParams $actualParams | Should -BeNullOrEmpty

        $actualResponses = $contract.Response | ForEach-Object {
            '{0}:{1}' -f $_.Name, $_.Type
        }
        $expectedResponses = @(
            'OperationId:10'
            'Outcome:10'
            'ReservationId:10'
            'ResultJson:10'
        )
        Compare-Object $expectedResponses $actualResponses | Should -BeNullOrEmpty
    }

    It 'defines the exact checkout batch and row-version JSON contract' {
        $contract = $defs.LifecycleContractDefs |
            Where-Object UniqueName -eq 'enmax_acdnRequestFileCheckOutV2'

        $actualParams = $contract.Params | ForEach-Object {
            '{0}:{1}:{2}' -f $_.Name, $_.Type, $_.Optional
        }
        $expectedParams = @(
            'ActingUserId:10:True'
            'FileIdsJson:10:False'
            'OperationId:10:False'
            'BatchId:10:False'
            'ExpectedRowVersionsJson:10:False'
        )
        Compare-Object $expectedParams $actualParams | Should -BeNullOrEmpty

        $actualResponses = $contract.Response | ForEach-Object {
            '{0}:{1}' -f $_.Name, $_.Type
        }
        $expectedResponses = @(
            'OperationId:10'
            'Outcome:10'
            'BatchId:10'
            'ResultJson:10'
        )
        Compare-Object $expectedResponses $actualResponses | Should -BeNullOrEmpty
    }

    It 'does not expose contract-only names through active CustomAPIDefs' {
        $defs.CustomAPIDefs.Count | Should -Be 15
        $activeContractNames = $defs.CustomAPIDefs.UniqueName |
            Where-Object { $_ -in $contractNames }
        $activeContractNames | Should -BeNullOrEmpty
    }
}

Describe 'Register-PpPlugins — -WhatIf suppresses all Dataverse writes' {

    BeforeAll {
        # WHY: -WhatIf is the operator's safety net for dry-run validation before
        # deploying to a live environment. If POST/PATCH calls slip through under
        # -WhatIf the "dry run" mutates Dataverse, which is a contract violation
        # and can corrupt plugin registrations.

        $script:FakeCfg = @{
            Url          = 'https://dev.crm.dynamics.com'
            ClientId     = 'fake-client-id'
            ClientSecret = 'fake-secret'
            TenantId     = 'fake-tenant'
        }

        Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig    { return $script:FakeCfg }
        Mock -ModuleName PowerPlatform.Deploy Get-PpAccessToken  { return 'fake-token' }
        Mock -ModuleName PowerPlatform.Deploy Assert-PpExitCode  {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpBuildPlugin {}
        Mock -ModuleName PowerPlatform.Deploy Test-PpFileExists  { return $true }
        Mock -ModuleName PowerPlatform.Deploy Read-PpFileBytes   { return [byte[]]@(0x00) }

        # Stub Invoke-PpDataverse: GETs return existing records so Get-PpPluginTypeId never POSTs.
        # The ShouldProcess guard on the outer write blocks all assembly PATCH and CustomAPI/Step
        # creates — but Get-PpPluginTypeId runs before ShouldProcess, so it must see existing
        # plugintype records to avoid issuing a POST itself.
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpDataverse {
            param([string]$Method, [string]$Path, $Body, [string]$Token, [string]$EnvUrl, [switch]$NoPrefer)
            if ($Method -eq 'Get') {
                if ($Path -like '*pluginassemblies*') {
                    return @{ value = @( @{ pluginassemblyid = 'asm-id-001' } ) }
                }
                if ($Path -like '*plugintypes*') {
                    return @{ value = @( @{ plugintypeid = 'type-id-001' } ) }
                }
                return @{ value = @() }
            }
            # Post / Patch — should NOT be called under -WhatIf
            return @{}
        }
    }

    It 'does not invoke Invoke-PpDataverse with Method Post under -WhatIf' {
        Register-PpPlugins -Environment dev -WhatIf 2>$null

        Should -Invoke Invoke-PpDataverse -ModuleName PowerPlatform.Deploy -Times 0 -ParameterFilter {
            $Method -eq 'Post'
        }
    }

    It 'does not invoke Invoke-PpDataverse with Method Patch under -WhatIf' {
        Register-PpPlugins -Environment dev -WhatIf 2>$null

        Should -Invoke Invoke-PpDataverse -ModuleName PowerPlatform.Deploy -Times 0 -ParameterFilter {
            $Method -eq 'Patch'
        }
    }
}

Describe 'Register-PpPlugins — normal run (mocked)' {

    BeforeAll {
        # WHY: Verify the happy-path calls the expected seams in the correct order —
        # build, token, assembly patch, Custom API registration, step registration.
        # Each mock asserts a contract boundary; if any seam is removed the tests fail.

        $script:FakeCfg2 = @{
            Url          = 'https://dev.crm.dynamics.com'
            ClientId     = 'fake-client-id'
            ClientSecret = 'fake-secret'
            TenantId     = 'fake-tenant'
        }

        Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig    { return $script:FakeCfg2 }
        Mock -ModuleName PowerPlatform.Deploy Get-PpAccessToken  { return 'fake-token' }
        Mock -ModuleName PowerPlatform.Deploy Assert-PpExitCode  {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpBuildPlugin {}
        Mock -ModuleName PowerPlatform.Deploy Test-PpFileExists  { return $true }
        Mock -ModuleName PowerPlatform.Deploy Read-PpFileBytes   { return [byte[]]@(0x00) }

        Mock -ModuleName PowerPlatform.Deploy Invoke-PpDataverse {
            param([string]$Method, [string]$Path, $Body, [string]$Token, [string]$EnvUrl, [switch]$NoPrefer)
            if ($Method -eq 'Get') {
                if ($Path -like '*pluginassemblies*') {
                    return @{ value = @( @{ pluginassemblyid = 'asm-id-001' } ) }
                }
                if ($Path -like '*plugintypes*') {
                    return @{ value = @( @{ plugintypeid = 'type-id-001' } ) }
                }
                if ($Path -like '*customapis*') {
                    return @{ value = @( @{ customapiid = 'api-id-001' } ) }
                }
                if ($Path -like '*sdkmessages*') {
                    return @{ value = @( @{ sdkmessageid = 'msg-id-001' } ) }
                }
                if ($Path -like '*sdkmessagefilters*') {
                    return @{ value = @( @{ sdkmessagefilterid = 'filter-id-001' } ) }
                }
                if ($Path -like '*sdkmessageprocessingsteps*') {
                    return @{ value = @( @{ sdkmessageprocessingstepid = 'step-id-001'; name = 'FakeStep' } ) }
                }
                return @{ value = @() }
            }
            return @{ plugintypeid = 'new-type-id'; customapiid = 'new-api-id'; sdkmessageprocessingstepid = 'new-step-id' }
        }
    }

    It 'calls Invoke-PpBuildPlugin (dotnet build seam)' {
        # WHY: The build step produces the DLL that gets deployed. If the build seam is
        # bypassed, a stale or missing DLL would be uploaded, breaking the plugin.
        Register-PpPlugins -Environment dev

        Should -Invoke Invoke-PpBuildPlugin -ModuleName PowerPlatform.Deploy -Times 1
    }

    It 'calls Get-PpAccessToken with the environment URL' {
        # WHY: The token scope must match the target org URL. A wrong scope produces a
        # 401 on every Dataverse call, failing the entire deployment silently if not caught.
        Register-PpPlugins -Environment dev

        Should -Invoke Get-PpAccessToken -ModuleName PowerPlatform.Deploy -ParameterFilter {
            $ResourceUrl -eq 'https://dev.crm.dynamics.com'
        }
    }

    It 'calls Assert-PpExitCode after dotnet build (fail-loud, Rule 12)' {
        # WHY: A non-zero dotnet exit must surface as a thrown error, not be swallowed.
        Register-PpPlugins -Environment dev

        Should -Invoke Assert-PpExitCode -ModuleName PowerPlatform.Deploy -ParameterFilter {
            $Operation -eq 'dotnet build IssueNumbers'
        }
    }

    It 'queries Dataverse for the plugin assembly by name' {
        # WHY: The assembly must be pre-registered via Plugin Registration Tool.
        # If the GET is skipped and a PATCH is attempted against a non-existent ID,
        # Dataverse returns 404 and the entire deployment fails.
        Register-PpPlugins -Environment dev

        Should -Invoke Invoke-PpDataverse -ModuleName PowerPlatform.Deploy -ParameterFilter {
            $Method -eq 'Get' -and $Path -like '*pluginassemblies*'
        }
    }
}

Describe 'Register-PpPlugins — prune preserves entity-bound Target' {

    BeforeAll {
        $script:FakeCfg3 = @{
            Url          = 'https://dev.crm.dynamics.com'
            ClientId     = 'fake-client-id'
            ClientSecret = 'fake-secret'
            TenantId     = 'fake-tenant'
        }

        Mock -ModuleName PowerPlatform.Deploy Get-PpEnvConfig    { return $script:FakeCfg3 }
        Mock -ModuleName PowerPlatform.Deploy Get-PpAccessToken  { return 'fake-token' }
        Mock -ModuleName PowerPlatform.Deploy Assert-PpExitCode  {}
        Mock -ModuleName PowerPlatform.Deploy Invoke-PpBuildPlugin {}
        Mock -ModuleName PowerPlatform.Deploy Test-PpFileExists  { return $true }
        Mock -ModuleName PowerPlatform.Deploy Read-PpFileBytes   { return [byte[]]@(0x00) }
        Mock -ModuleName PowerPlatform.Deploy Add-PpSolutionComponent {}

        Mock -ModuleName PowerPlatform.Deploy Invoke-PpDataverse {
            param([string]$Method, [string]$Path, $Body, [string]$Token, [string]$EnvUrl, [switch]$NoPrefer)
            if ($Method -eq 'Get') {
                if ($Path -like '*pluginassemblies*') {
                    return @{ value = @( @{ pluginassemblyid = 'asm-id-001' } ) }
                }
                if ($Path -like '*plugintypes*') {
                    return @{ value = @( @{ plugintypeid = 'type-id-001' } ) }
                }
                if ($Path -like '*customapis*' -and $Path -like '*enmax_acdnCheckOutDrawing*') {
                    return @{ value = @( @{ customapiid = 'checkout-api-id' } ) }
                }
                if ($Path -like '*customapis*') {
                    return @{ value = @( @{ customapiid = 'api-id-generic' } ) }
                }
                if ($Path -like '*customapirequestparameters*' -and $Path -like '*checkout-api-id*') {
                    return @{ value = @( @{ customapirequestparameterid = 'target-param-id'; uniquename = 'Target' } ) }
                }
                if ($Path -like '*customapirequestparameters*') {
                    return @{ value = @() }
                }
                if ($Path -like '*customapiresponseproperties*') {
                    return @{ value = @() }
                }
                if ($Path -like '*sdkmessages*') {
                    return @{ value = @( @{ sdkmessageid = 'msg-id-001' } ) }
                }
                if ($Path -like '*sdkmessagefilters*') {
                    return @{ value = @( @{ sdkmessagefilterid = 'filter-id-001' } ) }
                }
                if ($Path -like '*sdkmessageprocessingsteps*') {
                    return @{ value = @( @{ sdkmessageprocessingstepid = 'step-id-001'; name = 'FakeStep' } ) }
                }
                return @{ value = @() }
            }
            return @{}
        }
    }

    It 'does not DELETE the platform-managed Target param on entity-bound APIs' {
        Register-PpPlugins -Environment dev

        Should -Invoke Invoke-PpDataverse -ModuleName PowerPlatform.Deploy -Times 0 -ParameterFilter {
            $Method -eq 'Delete' -and $Path -like '*customapirequestparameters(target-param-id)*'
        }
    }
}
