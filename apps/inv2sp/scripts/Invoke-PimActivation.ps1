#Requires -Version 7.0
<#
.SYNOPSIS
    Self-activates an ELIGIBLE PIM role assignment via the ARM
    roleAssignmentScheduleRequests REST API, so deployment scripts don't
    require an interactive Azure Portal PIM activation.
.DESCRIPTION
    No service principal exists for this project (see PLAN.md / the
    tqnonline/enmax-apinvoice-integration prior-art discovery) - PIM
    activation for Azure resource roles has no `az` CLI-native command,
    only the Microsoft Entra "Connected Organizations" flow in the
    portal, or this REST API. This is a straight PowerShell port of the
    exact API calls the sibling repo's pim-activate.sh already used
    successfully for this same project (`az rest`, no extra module).

    API verified against Microsoft's own REST reference (2026-08-03):
    - GET  {scope}/providers/Microsoft.Authorization/roleEligibilitySchedules
           to find the eligibility to activate (its `name` is the
           linkedRoleEligibilityScheduleId the activation request needs).
    - PUT  {scope}/providers/Microsoft.Authorization/roleAssignmentScheduleRequests/{guid}
           with requestType=SelfActivate to actually activate it.
.PARAMETER Environment
    'dev' or 'prod'.
.PARAMETER Role
    Role display name to activate. Default: Contributor.
.PARAMETER DurationHours
    Activation window length. Default: 8 (matches the sibling repo's
    PIM_DURATION=PT8H default).
.PARAMETER Justification
    PIM justification text, required by most tenant PIM policies.
.EXAMPLE
    ./Invoke-PimActivation.ps1 -Environment dev
.EXAMPLE
    ./Invoke-PimActivation.ps1 -Environment prod -Role "Role Based Access Control Administrator" -DurationHours 2
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [string]$Role = 'Contributor',

    [ValidateRange(1, 24)]
    [int]$DurationHours = 8,

    [string]$Justification = 'INV2SP deployment activity'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'modules/Inv2Sp.Common.psm1') -Force

$config = Get-Inv2SpEnvironmentConfig -Environment $Environment
Assert-Inv2SpAzLogin -Environment $Environment | Out-Null

if (Test-Inv2SpActiveRole -Environment $Environment) {
    Write-Inv2SpLog "Already have an active role on $($config.ResourceGroup) - nothing to activate." -Level Success
    exit 0
}

$scope = "/subscriptions/$($config.SubscriptionId)/resourceGroups/$($config.ResourceGroup)"
$apiVersion = '2020-10-01'

Write-Inv2SpLog "Looking up role definition for '$Role'..." -Level Info
$roleDef = Invoke-Inv2SpAz role definition list --name $Role --query '[0]'
if (-not $roleDef) {
    throw "Role '$Role' not found in this tenant."
}
$roleDefinitionId = "/subscriptions/$($config.SubscriptionId)/providers/Microsoft.Authorization/roleDefinitions/$($roleDef.name)"

Write-Inv2SpLog 'Looking up your principal id...' -Level Info
$principalId = (Invoke-Inv2SpAz ad signed-in-user show --query id --output tsv).Trim()

Write-Inv2SpLog "Looking up an eligible assignment for '$Role' at $scope..." -Level Info
$eligibilityUrl = "https://management.azure.com$scope/providers/Microsoft.Authorization/roleEligibilitySchedules?`$filter=principalId eq '$principalId'&api-version=$apiVersion"
$eligibilities = Invoke-Inv2SpAz rest --method get --url $eligibilityUrl

$matching = @($eligibilities.value | Where-Object { $_.properties.roleDefinitionId -eq $roleDefinitionId -and $_.properties.status -eq 'Provisioned' })

if ($matching.Count -eq 0) {
    throw "No eligible '$Role' assignment found for you at $scope. Check that your eligibility is actually scoped here (not at subscription level) and that the role name matches exactly."
}

$eligibility = $matching[0]
$linkedScheduleId = $eligibility.name
Write-Inv2SpLog "Found eligible assignment $linkedScheduleId." -Level Success

$requestGuid = [Guid]::NewGuid().ToString()
$startTime = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$activationBody = @{
    properties = @{
        principalId                     = $principalId
        roleDefinitionId                = $roleDefinitionId
        requestType                     = 'SelfActivate'
        linkedRoleEligibilityScheduleId  = $linkedScheduleId
        justification                   = $Justification
        scheduleInfo                    = @{
            startDateTime = $startTime
            expiration    = @{
                type     = 'AfterDuration'
                duration = "PT${DurationHours}H"
            }
        }
    }
} | ConvertTo-Json -Depth 10 -Compress

$activationUrl = "https://management.azure.com$scope/providers/Microsoft.Authorization/roleAssignmentScheduleRequests/$requestGuid`?api-version=$apiVersion"

$tempBodyFile = [System.IO.Path]::GetTempFileName()
try {
    Set-Content -Path $tempBodyFile -Value $activationBody -NoNewline -Encoding utf8NoBOM
    Write-Inv2SpLog "Activating '$Role' for $DurationHours hour(s)..." -Level Info
    $result = Invoke-Inv2SpAz rest --method put --url $activationUrl --body "@$tempBodyFile" --headers 'Content-Type=application/json'
    Write-Inv2SpLog "Activation request status: $($result.properties.status)" -Level Success
} finally {
    Remove-Item -Path $tempBodyFile -Force -ErrorAction SilentlyContinue
}

Write-Inv2SpLog 'Waiting up to 60s for the activation to propagate...' -Level Info
$activated = $false
for ($i = 0; $i -lt 6; $i++) {
    Start-Sleep -Seconds 10
    if (Test-Inv2SpActiveRole -Environment $Environment) {
        $activated = $true
        break
    }
    Write-Inv2SpLog "Not yet visible ($(($i + 1) * 10)s elapsed)..." -Level Info
}

if ($activated) {
    Write-Inv2SpLog "'$Role' is now active on $($config.ResourceGroup) for $DurationHours hour(s)." -Level Success
} else {
    Write-Inv2SpLog 'Activation request was accepted but the role is not yet visible after 60s - it can take a few minutes to fully propagate. Re-run Test-Prerequisites.ps1 shortly.' -Level Warn
}
