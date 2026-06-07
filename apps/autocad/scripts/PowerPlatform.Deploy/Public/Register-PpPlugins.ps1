function Register-PpPlugins {
    <#
    .SYNOPSIS
      Build the Enmax.AutoCAD plugin DLL and idempotently register all Custom APIs
      and plugin steps in the target Dataverse environment.

    .DESCRIPTION
      Performs the following steps:
        1. Resolves credentials — real env vars (DATAVERSE_URL, DATAVERSE_TENANT_ID,
           DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET) take precedence over the
           local .env.<Environment> file, mirroring CI/CD behaviour.
        2. Builds solution\plugins\IssueNumbers\IssueNumbers.csproj (Release) via
           dotnet build, unless -SkipBuild is specified.
        3. Acquires an OAuth2 client_credentials token for the Dataverse org.
        4. Finds the pre-registered 'Enmax.AutoCAD' plugin assembly (must be registered
           once via Plugin Registration Tool before first run) and PATCHes its content
           with the freshly-built DLL.
        5. Idempotently registers all Custom APIs (GET-then-POST) and their request
           parameters / response properties.
        6. Idempotently registers all standard plugin steps and their images.

      All definitions are loaded from Data\PluginDefinitions.psd1 alongside this module.

      State-changing operations (assembly PATCH, POST creates) are guarded by
      SupportsShouldProcess — pass -WhatIf for a dry run that executes only GET reads.

    .PARAMETER Environment
      The environment name matching a .env.<Environment> file, e.g. 'dev', 'uat'.
      Used to load credentials when the DATAVERSE_* environment variables are absent.

    .PARAMETER SkipBuild
      When specified, skip the dotnet build step (useful when re-running registration
      after a build that already succeeded).

    .EXAMPLE
      Register-PpPlugins -Environment dev

      Builds the plugin and registers all Custom APIs + steps in the dev environment.

    .EXAMPLE
      Register-PpPlugins -Environment dev -WhatIf

      Performs all GET checks without making any changes. Safe for pre-deploy validation.

    .EXAMPLE
      Register-PpPlugins -Environment dev -SkipBuild

      Skips the dotnet build and goes straight to registration (DLL must already exist).

    .NOTES
      The plugin assembly 'Enmax.AutoCAD' MUST be pre-registered via Plugin Registration
      Tool before the first run. This cmdlet updates an existing assembly record; it will
      error (fail-loud) if the assembly is absent.

      Rule 14: Number issuance goes through the enmax_acdnIssueNumbers Custom API backed
      by this plugin. Do not alter the IssueNumbers API definition.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)]
        [string]$Environment,

        [switch]$SkipBuild,

        [string]$SolutionName = 'enmax_autocadsln'
    )

    # ── Resolve credentials ───────────────────────────────────────────────────
    # Prefer DATAVERSE_* env vars (CI passes these as secrets); fall back to .env file.
    $envUrl       = $env:DATAVERSE_URL
    $tenantId     = $env:DATAVERSE_TENANT_ID
    $clientId     = $env:DATAVERSE_CLIENT_ID
    $clientSecret = $env:DATAVERSE_CLIENT_SECRET

    if (-not ($envUrl -and $tenantId -and $clientId -and $clientSecret)) {
        Write-PpLog "DATAVERSE_* env vars not fully set — loading from .env.$Environment" -Level Verbose
        $cfg = Get-PpEnvConfig -Environment $Environment
        if (-not $envUrl)       { $envUrl       = $cfg.Url }
        if (-not $tenantId)     { $tenantId     = $cfg.TenantId }
        if (-not $clientId)     { $clientId     = $cfg.ClientId }
        if (-not $clientSecret) { $clientSecret = $cfg.ClientSecret }
    }

    if (-not ($envUrl -and $tenantId -and $clientId -and $clientSecret)) {
        throw "Register-PpPlugins: Missing one or more credentials (DATAVERSE_URL/TENANT_ID/CLIENT_ID/CLIENT_SECRET)."
    }
    $envUrl = $envUrl.TrimEnd('/')

    # ── Resolve paths ─────────────────────────────────────────────────────────
    $moduleRoot = Split-Path $PSScriptRoot -Parent                    # scripts/PowerPlatform.Deploy/
    $repoRoot   = Split-Path (Split-Path $moduleRoot -Parent) -Parent # repo root (module -> scripts -> repo)

    $pluginProj = Join-Path $repoRoot "solution/plugins/IssueNumbers/IssueNumbers.csproj"
    $dllPath    = Join-Path $repoRoot "solution/plugins/IssueNumbers/bin/Release/net462/Enmax.AutoCAD.dll"
    $defsPath   = Join-Path $moduleRoot "Data/PluginDefinitions.psd1"

    # ── 1. Build ──────────────────────────────────────────────────────────────
    if (-not $SkipBuild) {
        Write-PpLog "Building Enmax.AutoCAD plugin..."
        Invoke-PpBuildPlugin -ProjectPath $pluginProj
        Assert-PpExitCode -Operation 'dotnet build IssueNumbers'
        if (-not (Test-PpFileExists -Path $dllPath)) {
            throw "Register-PpPlugins: DLL not found at $dllPath after build."
        }
        Write-PpLog "Built: $dllPath" -Level Verbose
    } else {
        Write-PpLog "SkipBuild specified — skipping dotnet build." -Level Verbose
        if (-not (Test-PpFileExists -Path $dllPath)) {
            throw "Register-PpPlugins: DLL not found at $dllPath and -SkipBuild was specified."
        }
    }

    # ── 2. Load definitions ───────────────────────────────────────────────────
    $defs = Import-PowerShellDataFile $defsPath

    # ── 3. Acquire OAuth token ────────────────────────────────────────────────
    Write-PpLog "Acquiring Dataverse access token..."
    $token = Get-PpAccessToken -TenantId $tenantId -ClientId $clientId `
                               -ClientSecret $clientSecret -ResourceUrl $envUrl

    # ── 4. Find + update assembly ─────────────────────────────────────────────
    Write-PpLog "Finding plugin assembly 'Enmax.AutoCAD'..."
    $asmSearch = Invoke-PpDataverse -Method Get -Path "pluginassemblies?`$filter=name eq 'Enmax.AutoCAD'&`$select=pluginassemblyid,name,version" `
                                    -Token $token -EnvUrl $envUrl
    if ($asmSearch.value.Count -eq 0) {
        throw "Register-PpPlugins: Plugin assembly 'Enmax.AutoCAD' not found in Dataverse. Register it once via Plugin Registration Tool, then re-run."
    }
    $assemblyId = $asmSearch.value[0].pluginassemblyid
    Write-PpLog "Found assembly: $assemblyId" -Level Verbose

    if ($PSCmdlet.ShouldProcess($envUrl, "PATCH plugin assembly content ($assemblyId)")) {
        Write-PpLog "Updating assembly content..."
        $dllBase64 = [Convert]::ToBase64String((Read-PpFileBytes -Path $dllPath))
        Invoke-PpDataverse -Method Patch -Path "pluginassemblies($assemblyId)" `
                           -Body @{ content = $dllBase64 } `
                           -Token $token -EnvUrl $envUrl -NoPrefer
        Write-PpLog "Assembly updated."
    }

    # ── Caches (file-scoped, reset each run) ─────────────────────────────────
    $script:ppTypeIdCache = @{}
    $script:ppMsgIdCache  = @{}

    # ── 5. Register Custom APIs ───────────────────────────────────────────────
    Write-PpLog "Registering Custom APIs..."
    foreach ($def in $defs.CustomAPIDefs) {
        Write-PpLog "  -- $($def.UniqueName)" -Level Verbose
        $typeId = Get-PpPluginTypeId -ClassName $def.PluginClass -AssemblyId $assemblyId `
                                     -Token $token -EnvUrl $envUrl

        if ($PSCmdlet.ShouldProcess($envUrl, "Ensure CustomAPI $($def.UniqueName)")) {
            $apiId = Ensure-PpCustomAPI -UniqueName $def.UniqueName -DisplayName $def.DisplayName `
                                        -BindingType $def.BindingType -BoundEntity $def.BoundEntity `
                                        -TypeId $typeId -Token $token -EnvUrl $envUrl `
                                        -Description $def.Description
            foreach ($p in $def.Params) {
                Ensure-PpRequestParam -ApiId $apiId -Name $p.Name -Type $p.Type `
                                      -Optional $p.Optional -Token $token -EnvUrl $envUrl
            }
            foreach ($rp in $def.Response) {
                Ensure-PpResponseProp -ApiId $apiId -Name $rp.Name -Type $rp.Type `
                                      -Token $token -EnvUrl $envUrl
            }
        }
    }

    # ── 6. Register plugin steps ──────────────────────────────────────────────
    Write-PpLog "Registering plugin steps..."
    foreach ($def in $defs.StepDefs) {
        Write-PpLog "  -- $($def.Name)" -Level Verbose
        $typeId = Get-PpPluginTypeId -ClassName $def.PluginClass -AssemblyId $assemblyId `
                                     -Token $token -EnvUrl $envUrl

        if ($PSCmdlet.ShouldProcess($envUrl, "Ensure PluginStep $($def.Name)")) {
            Ensure-PpPluginStep -Def $def -TypeId $typeId -Token $token -EnvUrl $envUrl
        }
    }

    # ── 7. Ensure all plugin components belong to the solution ────────────────
    # Components created via the Web API land in the Default solution unless added
    # explicitly. Enumerate the assembly's live components and add each to
    # $SolutionName (idempotent — AddSolutionComponent on an existing member is a
    # no-op). Component types: 91=PluginAssembly, 10088=CustomAPI,
    # 10089=CustomAPIRequestParameter, 10090=CustomAPIResponseProperty,
    # 92=SdkMessageProcessingStep (step images ride along as subcomponents).
    if ($PSCmdlet.ShouldProcess($envUrl, "Sync plugin components into solution '$SolutionName'")) {
        Write-PpLog "Syncing plugin components into solution '$SolutionName'..."
        Add-PpSolutionComponent -ComponentId $assemblyId -ComponentType 91 -SolutionName $SolutionName -Token $token -EnvUrl $envUrl
        $asmTypes = (Invoke-PpDataverse -Method Get -Token $token -EnvUrl $envUrl `
            -Path "plugintypes?`$filter=_pluginassemblyid_value eq $assemblyId&`$select=plugintypeid").value
        foreach ($t in $asmTypes) {
            $tid = $t.plugintypeid
            foreach ($api in (Invoke-PpDataverse -Method Get -Token $token -EnvUrl $envUrl `
                -Path "customapis?`$filter=_plugintypeid_value eq $tid&`$select=customapiid").value) {
                Add-PpSolutionComponent -ComponentId $api.customapiid -ComponentType 10088 -SolutionName $SolutionName -Token $token -EnvUrl $envUrl
                foreach ($pr in (Invoke-PpDataverse -Method Get -Token $token -EnvUrl $envUrl `
                    -Path "customapirequestparameters?`$filter=_customapiid_value eq $($api.customapiid)&`$select=customapirequestparameterid").value) {
                    Add-PpSolutionComponent -ComponentId $pr.customapirequestparameterid -ComponentType 10089 -SolutionName $SolutionName -Token $token -EnvUrl $envUrl
                }
                foreach ($rp in (Invoke-PpDataverse -Method Get -Token $token -EnvUrl $envUrl `
                    -Path "customapiresponseproperties?`$filter=_customapiid_value eq $($api.customapiid)&`$select=customapiresponsepropertyid").value) {
                    Add-PpSolutionComponent -ComponentId $rp.customapiresponsepropertyid -ComponentType 10090 -SolutionName $SolutionName -Token $token -EnvUrl $envUrl
                }
            }
            foreach ($st in (Invoke-PpDataverse -Method Get -Token $token -EnvUrl $envUrl `
                -Path "sdkmessageprocessingsteps?`$filter=_plugintypeid_value eq $tid&`$select=sdkmessageprocessingstepid").value) {
                Add-PpSolutionComponent -ComponentId $st.sdkmessageprocessingstepid -ComponentType 92 -SolutionName $SolutionName -Token $token -EnvUrl $envUrl
            }
        }
        Write-PpLog "Solution component sync complete."
    }

    Write-PpLog "Register-PpPlugins complete for $envUrl."
}

# ═════════════════════════════════════════════════════════════════════════════
# File-scoped helpers (dot-sourced into module scope; NOT exported)
# ═════════════════════════════════════════════════════════════════════════════

function Invoke-PpBuildPlugin {
    <#
    .SYNOPSIS Thin, mockable wrapper around dotnet build for the plugin project. #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$ProjectPath)
    & dotnet build $ProjectPath -c Release --nologo -v quiet
}

function Test-PpFileExists {
    <#
    .SYNOPSIS Thin, mockable wrapper around Test-Path for file existence checks. Seam for Pester mocking. #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    return Test-Path $Path
}

function Read-PpFileBytes {
    <#
    .SYNOPSIS Thin, mockable wrapper around File.ReadAllBytes for reading a binary file. Seam for Pester mocking. #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    return [System.IO.File]::ReadAllBytes($Path)
}

function Get-PpAccessToken {
    <#
    .SYNOPSIS Acquires an OAuth2 client_credentials token for Dataverse. Mockable seam. #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$TenantId,
        [Parameter(Mandatory)][string]$ClientId,
        [Parameter(Mandatory)][string]$ClientSecret,
        [Parameter(Mandatory)][string]$ResourceUrl
    )
    $tok = Invoke-RestMethod -Method Post `
        -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
        -Body @{
            grant_type    = "client_credentials"
            client_id     = $ClientId
            client_secret = $ClientSecret
            scope         = "$ResourceUrl/.default"
        }
    return $tok.access_token
}

function Invoke-PpDataverse {
    <#
    .SYNOPSIS Thin, mockable Dataverse REST wrapper. Uses Prefer: return=representation
    unless -NoPrefer is set (needed for PATCH which returns 204). #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('Get','Post','Patch')][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [hashtable]$Body = $null,
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$EnvUrl,
        [switch]$NoPrefer
    )
    $headers = @{
        Authorization      = "Bearer $Token"
        "Content-Type"     = "application/json"
        "OData-MaxVersion" = "4.0"
        "OData-Version"    = "4.0"
    }
    if (-not $NoPrefer) { $headers["Prefer"] = "return=representation" }

    $uri      = "$EnvUrl/api/data/v9.2/$Path"
    $callArgs = @{ Method = $Method; Uri = $uri; Headers = $headers }
    if ($Body) { $callArgs.Body = ($Body | ConvertTo-Json -Depth 5 -Compress) }
    return Invoke-RestMethod @callArgs
}

function Add-PpSolutionComponent {
    <#
    .SYNOPSIS Add a component to a solution via the AddSolutionComponent action.
    Idempotent: adding a component already in the solution is a no-op (errors are
    swallowed at Verbose). #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ComponentId,
        [Parameter(Mandatory)][int]$ComponentType,
        [Parameter(Mandatory)][string]$SolutionName,
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$EnvUrl
    )
    try {
        Invoke-PpDataverse -Method Post -Path "AddSolutionComponent" -Token $Token -EnvUrl $EnvUrl -NoPrefer -Body @{
            ComponentId               = $ComponentId
            ComponentType             = $ComponentType
            SolutionUniqueName        = $SolutionName
            AddRequiredComponents     = $false
            DoNotIncludeSubcomponents = $false
        } | Out-Null
        Write-PpLog "  + solution component $ComponentType/$ComponentId" -Level Verbose
    }
    catch {
        Write-PpLog "  solution-add skipped ($ComponentType/$ComponentId): $($_.Exception.Message)" -Level Verbose
    }
}

function Get-PpPluginTypeId {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ClassName,
        [Parameter(Mandatory)][string]$AssemblyId,
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$EnvUrl
    )
    if ($script:ppTypeIdCache.ContainsKey($ClassName)) { return $script:ppTypeIdCache[$ClassName] }
    $r = Invoke-PpDataverse -Method Get `
        -Path "plugintypes?`$filter=typename eq '$ClassName' and _pluginassemblyid_value eq $AssemblyId&`$select=plugintypeid" `
        -Token $Token -EnvUrl $EnvUrl
    if ($r.value.Count -gt 0) {
        Write-PpLog "  PluginType exists: $ClassName ($($r.value[0].plugintypeid))" -Level Verbose
        $script:ppTypeIdCache[$ClassName] = $r.value[0].plugintypeid
        return $r.value[0].plugintypeid
    }
    Write-PpLog "  Creating PluginType: $ClassName" -Level Verbose
    $created = Invoke-PpDataverse -Method Post -Path "plugintypes" -Token $Token -EnvUrl $EnvUrl -Body @{
        typename     = $ClassName
        name         = $ClassName
        friendlyname = $ClassName
        "pluginassemblyid@odata.bind" = "/pluginassemblies($AssemblyId)"
    }
    $script:ppTypeIdCache[$ClassName] = $created.plugintypeid
    Write-PpLog "  Created PluginType: $($created.plugintypeid)" -Level Verbose
    return $created.plugintypeid
}

function Ensure-PpCustomAPI {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$UniqueName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][int]$BindingType,
        [string]$BoundEntity,
        [Parameter(Mandatory)][string]$TypeId,
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$EnvUrl,
        [string]$Description = $null
    )
    # Compute effective description: use supplied value (truncated to 300) or fall back to DisplayName.
    if ($Description -and $Description.Length -gt 0) {
        $desc = if ($Description.Length -gt 300) { $Description.Substring(0, 300) } else { $Description }
    } else {
        $desc = $DisplayName
    }

    $r = Invoke-PpDataverse -Method Get `
        -Path "customapis?`$filter=uniquename eq '$UniqueName'&`$select=customapiid,name,displayname,description" `
        -Token $Token -EnvUrl $EnvUrl
    if ($r.value.Count -gt 0) {
        $existing = $r.value[0]
        $id = $existing.customapiid
        Write-PpLog "  CustomAPI exists: $UniqueName ($id)" -Level Verbose

        # Heal any drift in name, displayname, description.
        $patch = @{}
        if ($existing.name        -ne $DisplayName) { $patch['name']        = $DisplayName }
        if ($existing.displayname -ne $DisplayName) { $patch['displayname'] = $DisplayName }
        if ($existing.description -ne $desc)        { $patch['description'] = $desc }
        if ($patch.Count -gt 0) {
            # $null = ... : the PATCH response must NOT leak to the pipeline. Without this,
            # the function returns @(<patch response>, $id) — an array — and every caller
            # that passes the result as -ApiId (a [string]) fails the cast. Latent until
            # name/displayname/description actually drift and the heal fires.
            $null = Invoke-PpDataverse -Method Patch -Path "customapis($id)" -Body $patch `
                                       -Token $Token -EnvUrl $EnvUrl -NoPrefer
            Write-PpLog "  Patched CustomAPI $UniqueName ($id): $($patch.Keys -join ', ')" -Level Verbose
        }
        return $id
    }
    Write-PpLog "  Creating CustomAPI: $UniqueName" -Level Verbose
    $body = @{
        uniquename                      = $UniqueName
        name                            = $DisplayName
        displayname                     = $DisplayName
        description                     = $desc
        bindingtype                     = $BindingType
        isfunction                      = $false
        isprivate                       = $false
        ismanaged                       = $false
        allowedcustomprocessingsteptype = 0
        "PluginTypeId@odata.bind"       = "/plugintypes($TypeId)"
    }
    if ($BoundEntity) { $body["boundentitylogicalname"] = $BoundEntity }
    $created = Invoke-PpDataverse -Method Post -Path "customapis" -Body $body -Token $Token -EnvUrl $EnvUrl
    Write-PpLog "  Created CustomAPI: $($created.customapiid)" -Level Verbose
    return $created.customapiid
}

function Ensure-PpRequestParam {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ApiId,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][int]$Type,
        [Parameter(Mandatory)][bool]$Optional,
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$EnvUrl
    )
    $r = Invoke-PpDataverse -Method Get `
        -Path "customapirequestparameters?`$filter=uniquename eq '$Name' and _customapiid_value eq $ApiId&`$select=customapirequestparameterid" `
        -Token $Token -EnvUrl $EnvUrl
    if ($r.value.Count -gt 0) { Write-PpLog "  Param exists: $Name" -Level Verbose; return }
    Write-PpLog "  Creating param: $Name (type=$Type, optional=$Optional)" -Level Verbose
    Invoke-PpDataverse -Method Post -Path "customapirequestparameters" -Token $Token -EnvUrl $EnvUrl -Body @{
        uniquename   = $Name
        name         = $Name
        displayname  = $Name
        description  = $Name
        type         = $Type
        isoptional   = $Optional
        "CustomAPIId@odata.bind" = "/customapis($ApiId)"
    } | Out-Null
}

function Ensure-PpResponseProp {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ApiId,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][int]$Type,
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$EnvUrl
    )
    $r = Invoke-PpDataverse -Method Get `
        -Path "customapiresponseproperties?`$filter=uniquename eq '$Name' and _customapiid_value eq $ApiId&`$select=customapiresponsepropertyid" `
        -Token $Token -EnvUrl $EnvUrl
    if ($r.value.Count -gt 0) { Write-PpLog "  Response prop exists: $Name" -Level Verbose; return }
    Write-PpLog "  Creating response prop: $Name (type=$Type)" -Level Verbose
    Invoke-PpDataverse -Method Post -Path "customapiresponseproperties" -Token $Token -EnvUrl $EnvUrl -Body @{
        uniquename  = $Name
        name        = $Name
        displayname = $Name
        description = $Name
        type        = $Type
        "CustomAPIId@odata.bind" = "/customapis($ApiId)"
    } | Out-Null
}

function Get-PpMessageId {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$MessageName,
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$EnvUrl
    )
    if ($script:ppMsgIdCache.ContainsKey($MessageName)) { return $script:ppMsgIdCache[$MessageName] }
    $r = Invoke-PpDataverse -Method Get `
        -Path "sdkmessages?`$filter=name eq '$MessageName'&`$select=sdkmessageid" `
        -Token $Token -EnvUrl $EnvUrl
    if ($r.value.Count -eq 0) { throw "Register-PpPlugins: SDK message '$MessageName' not found in Dataverse." }
    $script:ppMsgIdCache[$MessageName] = $r.value[0].sdkmessageid
    return $r.value[0].sdkmessageid
}

function Get-PpMessageFilterId {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$MsgId,
        [Parameter(Mandatory)][string]$Entity,
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$EnvUrl
    )
    $r = Invoke-PpDataverse -Method Get `
        -Path "sdkmessagefilters?`$filter=_sdkmessageid_value eq $MsgId and primaryobjecttypecode eq '$Entity'&`$select=sdkmessagefilterid" `
        -Token $Token -EnvUrl $EnvUrl
    if ($r.value.Count -eq 0) { throw "Register-PpPlugins: Message filter not found for entity '$Entity' + messageId '$MsgId'." }
    return $r.value[0].sdkmessagefilterid
}

function Ensure-PpPluginStep {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Def,
        [Parameter(Mandatory)][string]$TypeId,
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$EnvUrl
    )
    $msgId    = Get-PpMessageId    -MessageName $Def.Message -Token $Token -EnvUrl $EnvUrl
    $filterId = Get-PpMessageFilterId -MsgId $msgId -Entity $Def.Entity -Token $Token -EnvUrl $EnvUrl

    $r = Invoke-PpDataverse -Method Get `
        -Path "sdkmessageprocessingsteps?`$filter=_plugintypeid_value eq $TypeId and _sdkmessageid_value eq $msgId and stage eq $($Def.Stage) and _sdkmessagefilterid_value eq $filterId&`$select=sdkmessageprocessingstepid,name" `
        -Token $Token -EnvUrl $EnvUrl

    if ($r.value.Count -gt 0) {
        $stepId = $r.value[0].sdkmessageprocessingstepid
        Write-PpLog "  Step exists: $($r.value[0].name) ($stepId)" -Level Verbose
    } else {
        Write-PpLog "  Creating step: $($Def.Name)" -Level Verbose
        $body = @{
            name                  = $Def.Name
            description           = $Def.Name
            stage                 = $Def.Stage
            mode                  = $Def.Mode
            rank                  = $Def.Rank
            supporteddeployment   = 0
            asyncautodelete       = ($Def.Mode -eq 1)
            "plugintypeid@odata.bind"       = "/plugintypes($TypeId)"
            "sdkmessageid@odata.bind"       = "/sdkmessages($msgId)"
            "sdkmessagefilterid@odata.bind" = "/sdkmessagefilters($filterId)"
        }
        if ($Def.FilterAttributes) { $body["filteringattributes"] = $Def.FilterAttributes }
        $created = Invoke-PpDataverse -Method Post -Path "sdkmessageprocessingsteps" -Body $body `
                                      -Token $Token -EnvUrl $EnvUrl
        $stepId  = $created.sdkmessageprocessingstepid
        Write-PpLog "  Created step: $stepId" -Level Verbose
    }

    foreach ($img in $Def.Images) {
        $imgR = Invoke-PpDataverse -Method Get `
            -Path "sdkmessageprocessingstepimages?`$filter=_sdkmessageprocessingstepid_value eq $stepId and name eq '$($img.Name)'&`$select=sdkmessageprocessingstepimageid" `
            -Token $Token -EnvUrl $EnvUrl
        if ($imgR.value.Count -gt 0) {
            Write-PpLog "  Image exists: $($img.Name)" -Level Verbose
        } else {
            Write-PpLog "  Creating image: $($img.Name)" -Level Verbose
            Invoke-PpDataverse -Method Post -Path "sdkmessageprocessingstepimages" -Token $Token -EnvUrl $EnvUrl -Body @{
                name        = $img.Name
                entityalias = $img.Name
                imagetype   = $img.ImageType
                attributes  = $img.Attributes
                "sdkmessageprocessingstepid@odata.bind" = "/sdkmessageprocessingsteps($stepId)"
            } | Out-Null
        }
    }
}
