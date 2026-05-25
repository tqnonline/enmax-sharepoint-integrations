#Requires -Version 7
<#
.SYNOPSIS
  Build Enmax.AutoCAD.dll, update it in Dataverse, then idempotently register
  all Custom APIs and standard plugin steps defined in the assembly.

  Run from repo root:
      .\scripts\deploy-plugins.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot   = Split-Path $PSScriptRoot -Parent
$CodeApp    = Join-Path $RepoRoot "apps\code-app"
$EnvFile    = Join-Path $CodeApp ".env.dev"
$PluginProj = Join-Path $RepoRoot "solution\plugins\IssueNumbers\IssueNumbers.csproj"
$DllPath    = Join-Path $RepoRoot "solution\plugins\IssueNumbers\bin\Release\net462\Enmax.AutoCAD.dll"

# ── Resolve credentials ───────────────────────────────────────────────────────
# Prefer environment variables (CI/CD passes these as secrets); fall back to the
# local apps/code-app/.env.dev file (worktree-aware) for developer machines.
$tenantId     = $env:DATAVERSE_TENANT_ID
$clientId     = $env:DATAVERSE_CLIENT_ID
$clientSecret = $env:DATAVERSE_CLIENT_SECRET
$envUrl       = $env:DATAVERSE_URL

if (-not ($tenantId -and $clientId -and $clientSecret -and $envUrl)) {
    if (-not (Test-Path $EnvFile)) {
        $GitCommonDir = & git -C $RepoRoot rev-parse --git-common-dir 2>$null
        if ($GitCommonDir) {
            $MainRoot    = Split-Path ([System.IO.Path]::GetFullPath($GitCommonDir)) -Parent
            $FallbackEnv = Join-Path $MainRoot "apps\code-app\.env.dev"
            if (Test-Path $FallbackEnv) { $EnvFile = $FallbackEnv }
        }
    }
    if (-not (Test-Path $EnvFile)) {
        Write-Error "Credentials not in environment (DATAVERSE_*) and .env.dev not found at $EnvFile"
    }
    $envMap = @{}
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
        if ($line -match '^([^=]+)=(.*)$') {
            $envMap[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"')
        }
    }
    if (-not $tenantId)     { $tenantId     = $envMap['TENANT_ID'] }
    if (-not $clientId)     { $clientId     = $envMap['CLIENT_ID'] }
    if (-not $clientSecret) { $clientSecret = $envMap['CLIENT_SECRET'] }
    if (-not $envUrl)       { $envUrl       = $envMap['ENVIRONMENT_URL'] }
}

if (-not ($tenantId -and $clientId -and $clientSecret -and $envUrl)) {
    Write-Error "Missing one or more credentials (TENANT_ID/CLIENT_ID/CLIENT_SECRET/ENVIRONMENT_URL)."
}
$envUrl = $envUrl.TrimEnd('/')

# ── Plugin definitions ────────────────────────────────────────────────────────
#
# CustomAPI bindingtype:           0=Global  1=Entity  2=EntityCollection
# CustomAPIRequestParameter type:  5=EntityReference  7=Integer  9=Picklist  10=String
# CustomAPIResponseProperty type:  same codes
# PluginStep stage:                20=PreValidation  40=PostOperation
# PluginStep mode:                 0=Synchronous  1=Asynchronous
#
# Entity-bound APIs (bindingtype=1) receive Target automatically from the
# URL segment — do NOT register Target as an explicit request parameter.

$CustomAPIDefs = @(

    # ── Global: IssueNumbers ──────────────────────────────────────────────────
    [ordered]@{
        UniqueName  = "enmax_acdnIssueNumbers"
        DisplayName = "Issue Drawing Numbers"
        PluginClass = "Enmax.AutoCAD.IssueNumbersPlugin"
        BindingType = 0
        BoundEntity = $null
        Params = @(
            @{ Name="Business"; Type=10; Optional=$false }
            @{ Name="Asset";    Type=10; Optional=$false }
            @{ Name="Unit";     Type=10; Optional=$false }
            @{ Name="Domain";   Type=10; Optional=$false }
            @{ Name="System";   Type=10; Optional=$false }
            @{ Name="Kind";     Type=10; Optional=$false }
            @{ Name="Count";    Type=7;  Optional=$false }
        )
        Response = @(
            @{ Name="IssuedNumbers";  Type=10 }
            @{ Name="SequenceKey";    Type=10 }
            @{ Name="NewLastIssued";  Type=7  }
            @{ Name="Status";         Type=9  }
        )
    }

    # ── Entity-bound: Reservation lifecycle ──────────────────────────────────
    [ordered]@{
        UniqueName  = "enmax_acdnApproveReservation"
        DisplayName = "Approve Reservation"
        PluginClass = "Enmax.AutoCAD.ApproveReservationPlugin"
        BindingType = 1
        BoundEntity = "enmax_autocadreservation"
        Params      = @()
        Response    = @()
    }

    [ordered]@{
        UniqueName  = "enmax_acdnDeclineReservation"
        DisplayName = "Decline Reservation"
        PluginClass = "Enmax.AutoCAD.DeclineReservationPlugin"
        BindingType = 1
        BoundEntity = "enmax_autocadreservation"
        Params = @(
            @{ Name="Reason"; Type=10; Optional=$true }
        )
        Response = @()
    }

    [ordered]@{
        UniqueName  = "enmax_acdnCreateDrawings"
        DisplayName = "Create Drawings"
        PluginClass = "Enmax.AutoCAD.CreateDrawingsPlugin"
        BindingType = 1
        BoundEntity = "enmax_autocadreservation"
        Params = @(
            @{ Name="IssuedNumbers"; Type=10; Optional=$false }
            @{ Name="SequenceKey";   Type=10; Optional=$false }
        )
        Response = @(
            @{ Name="DrawingsCreated"; Type=7 }
        )
    }

    # ── Entity-bound: Drawing checkout ───────────────────────────────────────
    [ordered]@{
        UniqueName  = "enmax_acdnCheckOutDrawing"
        DisplayName = "Check Out Drawing"
        PluginClass = "Enmax.AutoCAD.CheckOutDrawingPlugin"
        BindingType = 1
        BoundEntity = "enmax_autocaddrawing"
        Params      = @()
        Response = @(
            @{ Name="CheckoutId"; Type=10 }
        )
    }

    [ordered]@{
        UniqueName  = "enmax_acdnApproveCheckin"
        DisplayName = "Approve Check-In"
        PluginClass = "Enmax.AutoCAD.ApproveCheckinPlugin"
        BindingType = 1
        BoundEntity = "enmax_autocadcheckout"
        Params = @(
            @{ Name="Decision"; Type=7;  Optional=$false }
            @{ Name="Reason";   Type=10; Optional=$true  }
        )
        Response = @(
            @{ Name="CheckoutId";   Type=10 }
            @{ Name="NewStatus";    Type=7  }
            @{ Name="DrawingState"; Type=7  }
        )
    }

    [ordered]@{
        UniqueName  = "enmax_acdnForceCheckin"
        DisplayName = "Force Check-In"
        PluginClass = "Enmax.AutoCAD.ForceCheckinPlugin"
        BindingType = 1
        BoundEntity = "enmax_autocadcheckout"
        Params = @(
            @{ Name="NewRevision"; Type=10; Optional=$false }
            @{ Name="Reason";      Type=10; Optional=$false }
        )
        Response = @(
            @{ Name="CheckoutId";   Type=10 }
            @{ Name="DrawingState"; Type=7  }
        )
    }

    # ── Entity-bound: Drawing lifecycle (plan-12) ────────────────────────────
    [ordered]@{
        UniqueName  = "enmax_acdnSubmitRevision"
        DisplayName = "Submit Revision"
        PluginClass = "Enmax.AutoCAD.SubmitRevisionPlugin"
        BindingType = 1
        BoundEntity = "enmax_autocadcheckout"
        Params = @(
            @{ Name="NewRevision"; Type=10; Optional=$false }
            @{ Name="Reason";      Type=10; Optional=$true  }
        )
        Response = @(
            @{ Name="NewStatus";    Type=7 }
            @{ Name="DrawingState"; Type=7 }
        )
    }

    [ordered]@{
        UniqueName  = "enmax_acdnFinalizeDrawing"
        DisplayName = "Finalize Drawing"
        PluginClass = "Enmax.AutoCAD.FinalizeDrawingPlugin"
        BindingType = 1
        BoundEntity = "enmax_autocaddrawing"
        Params = @(
            @{ Name="Reason"; Type=10; Optional=$false }
        )
        Response = @()
    }

    [ordered]@{
        UniqueName  = "enmax_acdnMarkObsolete"
        DisplayName = "Mark Drawing Obsolete"
        PluginClass = "Enmax.AutoCAD.MarkObsoletePlugin"
        BindingType = 1
        BoundEntity = "enmax_autocaddrawing"
        Params = @(
            @{ Name="Reason"; Type=10; Optional=$true }
        )
        Response = @()
    }

    [ordered]@{
        UniqueName  = "enmax_acdnMarkVoid"
        DisplayName = "Mark Drawing Void"
        PluginClass = "Enmax.AutoCAD.MarkVoidPlugin"
        BindingType = 1
        BoundEntity = "enmax_autocaddrawing"
        Params = @(
            @{ Name="Reason"; Type=10; Optional=$false }
        )
        Response = @()
    }
)

$StepDefs = @(

    [ordered]@{
        Name             = "Enmax.AutoCAD.OnReservationCreatedPlugin: Create of enmax_autocadreservation"
        PluginClass      = "Enmax.AutoCAD.OnReservationCreatedPlugin"
        Message          = "Create"
        Entity           = "enmax_autocadreservation"
        Stage            = 40
        Mode             = 0    # Synchronous
        Rank             = 1
        FilterAttributes = $null
        Images           = @()
    }

    [ordered]@{
        Name             = "Enmax.AutoCAD.AutoCreateDrawingsPlugin: Update of enmax_autocadreservation"
        PluginClass      = "Enmax.AutoCAD.AutoCreateDrawingsPlugin"
        Message          = "Update"
        Entity           = "enmax_autocadreservation"
        Stage            = 40
        Mode             = 1    # Asynchronous
        Rank             = 1
        FilterAttributes = "enmax_acdnissuednumbers"
        Images           = @(
            @{
                Name       = "postImage"
                ImageType  = 1   # PostImage
                Attributes = "enmax_acdnstatus,enmax_acdnissuednumbers,enmax_acdnsheetsperdrawing,ownerid,enmax_acdnbusiness,enmax_acdnasset,enmax_acdnunit,enmax_acdndomain,enmax_acdnsystem,enmax_acdnkind"
            }
        )
    }
)

# ── 1. Build ─────────────────────────────────────────────────────────────────
Write-Host "==> Building Enmax.AutoCAD plugin..." -ForegroundColor Cyan
dotnet build $PluginProj -c Release --nologo -v quiet
if ($LASTEXITCODE -ne 0) { Write-Error "dotnet build failed" }
if (-not (Test-Path $DllPath)) { Write-Error "DLL not found at $DllPath after build" }
Write-Host "    Built: $DllPath"

# ── 2. OAuth token (client credentials) ──────────────────────────────────────
Write-Host "==> Getting access token..." -ForegroundColor Cyan
$tok = Invoke-RestMethod -Method Post `
    -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token" `
    -Body @{
        grant_type    = "client_credentials"
        client_id     = $clientId
        client_secret = $clientSecret
        scope         = "$envUrl/.default"
    }
$hdrs = @{
    Authorization      = "Bearer $($tok.access_token)"
    "Content-Type"     = "application/json"
    "OData-MaxVersion" = "4.0"
    "OData-Version"    = "4.0"
    Prefer             = "return=representation"
}
$hdrsNoPref = @{
    Authorization      = "Bearer $($tok.access_token)"
    "Content-Type"     = "application/json"
    "OData-MaxVersion" = "4.0"
    "OData-Version"    = "4.0"
}

function Invoke-Dataverse {
    param([string]$Method, [string]$Path, [hashtable]$Body = $null)
    $uri  = "$envUrl/api/data/v9.2/$Path"
    $args = @{ Method = $Method; Uri = $uri; Headers = $hdrs }
    if ($Body) { $args.Body = ($Body | ConvertTo-Json -Depth 5 -Compress) }
    return Invoke-RestMethod @args
}

# ── 3. Find + update plugin assembly ─────────────────────────────────────────
Write-Host "==> Finding plugin assembly 'Enmax.AutoCAD'..." -ForegroundColor Cyan
$asmSearch = Invoke-Dataverse Get "pluginassemblies?`$filter=name eq 'Enmax.AutoCAD'&`$select=pluginassemblyid,name,version"
if ($asmSearch.value.Count -eq 0) {
    Write-Error @"
Plugin assembly 'Enmax.AutoCAD' not found in Dataverse.
Register it once via Plugin Registration Tool, then re-run this script.
"@
}
$assemblyId = $asmSearch.value[0].pluginassemblyid
Write-Host "    Found: $assemblyId"

Write-Host "==> Updating assembly content..." -ForegroundColor Cyan
$dllBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($DllPath))
Invoke-RestMethod -Method Patch `
    -Uri "$envUrl/api/data/v9.2/pluginassemblies($assemblyId)" `
    -Headers $hdrsNoPref `
    -Body (@{ content = $dllBase64 } | ConvertTo-Json -Depth 2 -Compress)
Write-Host "    Assembly updated."

# ── 4. Helper functions ───────────────────────────────────────────────────────

$typeIdCache = @{}

function Get-PluginTypeId([string]$ClassName) {
    if ($typeIdCache.ContainsKey($ClassName)) { return $typeIdCache[$ClassName] }
    $r = Invoke-Dataverse Get "plugintypes?`$filter=typename eq '$ClassName' and _pluginassemblyid_value eq $assemblyId&`$select=plugintypeid"
    if ($r.value.Count -gt 0) {
        Write-Host "    PluginType exists: $ClassName ($($r.value[0].plugintypeid))"
        $typeIdCache[$ClassName] = $r.value[0].plugintypeid
        return $r.value[0].plugintypeid
    }
    Write-Host "    Creating PluginType: $ClassName"
    $created = Invoke-Dataverse Post "plugintypes" @{
        typename     = $ClassName
        name         = $ClassName
        friendlyname = $ClassName
        "pluginassemblyid@odata.bind" = "/pluginassemblies($assemblyId)"
    }
    $typeIdCache[$ClassName] = $created.plugintypeid
    Write-Host "    Created: $($created.plugintypeid)"
    return $created.plugintypeid
}

function Ensure-CustomAPI([string]$UniqueName, [string]$DisplayName, [int]$BindingType, [string]$BoundEntity, [string]$TypeId) {
    $r = Invoke-Dataverse Get "customapis?`$filter=uniquename eq '$UniqueName'&`$select=customapiid"
    if ($r.value.Count -gt 0) {
        Write-Host "    CustomAPI exists: $UniqueName ($($r.value[0].customapiid))"
        return $r.value[0].customapiid
    }
    Write-Host "    Creating CustomAPI: $UniqueName"
    $body = @{
        uniquename                      = $UniqueName
        name                            = $DisplayName
        displayname                     = $DisplayName
        description                     = $DisplayName
        bindingtype                     = $BindingType
        isfunction                      = $false
        isprivate                       = $false
        ismanaged                       = $false
        allowedcustomprocessingsteptype = 0
        "PluginTypeId@odata.bind"       = "/plugintypes($TypeId)"
    }
    if ($BoundEntity) { $body["boundentitylogicalname"] = $BoundEntity }
    $created = Invoke-Dataverse Post "customapis" $body
    Write-Host "    Created: $($created.customapiid)"
    return $created.customapiid
}

function Ensure-RequestParam([string]$ApiId, [string]$Name, [int]$Type, [bool]$Optional) {
    $r = Invoke-Dataverse Get "customapirequestparameters?`$filter=uniquename eq '$Name' and _customapiid_value eq $ApiId&`$select=customapirequestparameterid"
    if ($r.value.Count -gt 0) { Write-Host "    Param exists: $Name"; return }
    Write-Host "    Creating param: $Name (type=$Type, optional=$Optional)"
    Invoke-Dataverse Post "customapirequestparameters" @{
        uniquename   = $Name
        name         = $Name
        displayname  = $Name
        description  = $Name
        type         = $Type
        isoptional   = $Optional
        "CustomAPIId@odata.bind" = "/customapis($ApiId)"
    } | Out-Null
}

function Ensure-ResponseProp([string]$ApiId, [string]$Name, [int]$Type) {
    $r = Invoke-Dataverse Get "customapiresponseproperties?`$filter=uniquename eq '$Name' and _customapiid_value eq $ApiId&`$select=customapiresponsepropertyid"
    if ($r.value.Count -gt 0) { Write-Host "    Response prop exists: $Name"; return }
    Write-Host "    Creating response prop: $Name (type=$Type)"
    Invoke-Dataverse Post "customapiresponseproperties" @{
        uniquename  = $Name
        name        = $Name
        displayname = $Name
        description = $Name
        type        = $Type
        "CustomAPIId@odata.bind" = "/customapis($ApiId)"
    } | Out-Null
}

$msgIdCache = @{}

function Get-MessageId([string]$MessageName) {
    if ($msgIdCache.ContainsKey($MessageName)) { return $msgIdCache[$MessageName] }
    $r = Invoke-Dataverse Get "sdkmessages?`$filter=name eq '$MessageName'&`$select=sdkmessageid"
    if ($r.value.Count -eq 0) { Write-Error "SDK message '$MessageName' not found" }
    $msgIdCache[$MessageName] = $r.value[0].sdkmessageid
    return $r.value[0].sdkmessageid
}

function Get-MessageFilterId([string]$MsgId, [string]$Entity) {
    $r = Invoke-Dataverse Get "sdkmessagefilters?`$filter=_sdkmessageid_value eq $MsgId and primaryobjecttypecode eq '$Entity'&`$select=sdkmessagefilterid"
    if ($r.value.Count -eq 0) { Write-Error "Message filter not found for $Entity + $MsgId" }
    return $r.value[0].sdkmessagefilterid
}

function Ensure-PluginStep([hashtable]$Def, [string]$TypeId) {
    $msgId    = Get-MessageId $Def.Message
    $filterId = Get-MessageFilterId $msgId $Def.Entity

    $r = Invoke-Dataverse Get "sdkmessageprocessingsteps?`$filter=_plugintypeid_value eq $TypeId and _sdkmessageid_value eq $msgId and stage eq $($Def.Stage)&`$select=sdkmessageprocessingstepid,name"
    if ($r.value.Count -gt 0) {
        $stepId = $r.value[0].sdkmessageprocessingstepid
        Write-Host "    Step exists: $($r.value[0].name) ($stepId)"
    } else {
        Write-Host "    Creating step: $($Def.Name)"
        $body = @{
            name                  = $Def.Name
            description           = $Def.Name
            stage                 = $Def.Stage
            mode                  = $Def.Mode
            rank                  = $Def.Rank
            supporteddeployment   = 0
            asyncautodelete       = ($Def.Mode -eq 1)
            "plugintypeid@odata.bind"           = "/plugintypes($TypeId)"
            "sdkmessageid@odata.bind"           = "/sdkmessages($msgId)"
            "sdkmessagefilterid@odata.bind"     = "/sdkmessagefilters($filterId)"
        }
        if ($Def.FilterAttributes) { $body["filteringattributes"] = $Def.FilterAttributes }
        $created = Invoke-Dataverse Post "sdkmessageprocessingsteps" $body
        $stepId  = $created.sdkmessageprocessingstepid
        Write-Host "    Created: $stepId"
    }

    foreach ($img in $Def.Images) {
        $imgR = Invoke-Dataverse Get "sdkmessageprocessingstepimages?`$filter=_sdkmessageprocessingstepid_value eq $stepId and name eq '$($img.Name)'&`$select=sdkmessageprocessingstepimageid"
        if ($imgR.value.Count -gt 0) {
            Write-Host "    Image exists: $($img.Name)"
        } else {
            Write-Host "    Creating image: $($img.Name)"
            Invoke-Dataverse Post "sdkmessageprocessingstepimages" @{
                name        = $img.Name
                entityalias = $img.Name
                imagetype   = $img.ImageType
                attributes  = $img.Attributes
                "sdkmessageprocessingstepid@odata.bind" = "/sdkmessageprocessingsteps($stepId)"
            } | Out-Null
        }
    }
}

# ── 5. Register Custom APIs ───────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Registering Custom APIs..." -ForegroundColor Cyan

foreach ($def in $CustomAPIDefs) {
    Write-Host "  -- $($def.UniqueName)"
    $typeId = Get-PluginTypeId $def.PluginClass
    $apiId  = Ensure-CustomAPI $def.UniqueName $def.DisplayName $def.BindingType $def.BoundEntity $typeId
    foreach ($p in $def.Params)    { Ensure-RequestParam $apiId $p.Name $p.Type $p.Optional }
    foreach ($rp in $def.Response) { Ensure-ResponseProp $apiId $rp.Name $rp.Type }
}

# ── 6. Register standard plugin steps ────────────────────────────────────────
Write-Host ""
Write-Host "==> Registering plugin steps..." -ForegroundColor Cyan

foreach ($def in $StepDefs) {
    Write-Host "  -- $($def.Name)"
    $typeId = Get-PluginTypeId $def.PluginClass
    Ensure-PluginStep $def $typeId
}

Write-Host ""
Write-Host "==> Done." -ForegroundColor Green
