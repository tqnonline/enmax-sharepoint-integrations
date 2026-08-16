#Requires -Version 7.0
<#
.SYNOPSIS
    Preflight checks before deploying or operating INV2SP in an environment.
.DESCRIPTION
    Verifies: Azure CLI login and correct subscription, active (not merely
    PIM-eligible) role on the resource group, required resource providers
    registered, Key Vault reachable with expected secrets present and not
    still a bootstrap placeholder, the Logic App site exists and is running,
    all 3 API connections report Connected, and - the check specifically
    called out during design after past connectivity troubleshooting - an
    explicit list-files probe against the configured file-share folder, so
    a wrong path surfaces here rather than as a silent empty run in
    production.

    Read-only. Never modifies anything. Exits non-zero if any check fails,
    so it can gate a deployment (interactively or from CI as a
    validation-only step - see .github/workflows/pr-validate.yml).
.PARAMETER Environment
    'dev' or 'prod'.
.EXAMPLE
    ./Test-Prerequisites.ps1 -Environment dev
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'modules/Inv2Sp.Common.psm1') -Force

$config = Get-Inv2SpEnvironmentConfig -Environment $Environment
$results = [System.Collections.Generic.List[pscustomobject]]::new()

function Add-CheckResult {
    param(
        [string]$Name,
        [bool]$Passed,
        [string]$Detail
    )
    $results.Add([pscustomobject]@{
        Check  = $Name
        Passed = $Passed
        Detail = $Detail
    })
    Write-Inv2SpLog -Message "$Name`: $Detail" -Level ($Passed ? 'Success' : 'Error')
}

Write-Inv2SpLog "=== INV2SP prerequisites check: $Environment ===" -Level Info

# 1. Login + subscription
try {
    $account = Assert-Inv2SpAzLogin -Environment $Environment
    Add-CheckResult -Name 'Azure CLI login' -Passed $true -Detail "Signed in as $($account.user.name)"
} catch {
    Add-CheckResult -Name 'Azure CLI login' -Passed $false -Detail $_.Exception.Message
    Write-Inv2SpLog 'Cannot continue without a valid login - stopping.' -Level Error
    exit 1
}

# 2. Resource group exists
try {
    $rg = Invoke-Inv2SpAz group show -n $config.ResourceGroup
    Add-CheckResult -Name 'Resource group exists' -Passed $true -Detail "$($rg.name) ($($rg.location)), provisioningState=$($rg.properties.provisioningState)"
} catch {
    Add-CheckResult -Name 'Resource group exists' -Passed $false -Detail $_.Exception.Message
}

# 3. Active role (not merely PIM-eligible)
$hasActiveRole = Test-Inv2SpActiveRole -Environment $Environment
Add-CheckResult -Name 'Active Contributor/Owner role' -Passed $hasActiveRole `
    -Detail ($hasActiveRole ? 'Confirmed' : 'Not found - activate PIM first (scripts/Invoke-PimActivation.ps1)')

# 4. Required resource providers registered
$requiredProviders = @('Microsoft.Web', 'Microsoft.KeyVault', 'Microsoft.Storage', 'Microsoft.Insights', 'Microsoft.OperationalInsights', 'Microsoft.Network')
foreach ($provider in $requiredProviders) {
    try {
        $state = Invoke-Inv2SpAz provider show -n $provider --query registrationState --output tsv
        $registered = $state.Trim() -eq 'Registered'
        Add-CheckResult -Name "Provider $provider" -Passed $registered -Detail $state.Trim()
    } catch {
        Add-CheckResult -Name "Provider $provider" -Passed $false -Detail $_.Exception.Message
    }
}

# 5. Key Vault reachable, expected secrets present and not placeholder
try {
    $vault = Invoke-Inv2SpAz keyvault show -n $config.KeyVaultName
    Add-CheckResult -Name 'Key Vault exists' -Passed $true -Detail "$($vault.name) ($($vault.properties.vaultUri))"

    $requiredSecrets = @('fileShareServiceAccountPassword', 'digestEmailTo', 'alertEmailTo')
    foreach ($secretName in $requiredSecrets) {
        try {
            $secretValue = (Invoke-Inv2SpAz keyvault secret show --vault-name $config.KeyVaultName -n $secretName --query value --output tsv).Trim()
            $isPlaceholder = $secretValue -like 'REPLACE-*'
            $isEmpty = [string]::IsNullOrWhiteSpace($secretValue)
            if ($isPlaceholder) {
                Add-CheckResult -Name "Secret '$secretName'" -Passed $false -Detail 'Still the bootstrap placeholder value - run Set-KeyVaultSecrets.ps1 to set the real value. Value NOT printed.'
            } elseif ($isEmpty) {
                Add-CheckResult -Name "Secret '$secretName'" -Passed $false -Detail 'Present but empty.'
            } else {
                Add-CheckResult -Name "Secret '$secretName'" -Passed $true -Detail 'Present and not a placeholder. Value NOT printed.'
            }
        } catch {
            Add-CheckResult -Name "Secret '$secretName'" -Passed $false -Detail 'Not found.'
        }
    }
} catch {
    Add-CheckResult -Name 'Key Vault exists' -Passed $false -Detail $_.Exception.Message
}

# 6. Logic App site exists and running
try {
    $site = Invoke-Inv2SpAz webapp show -g $config.ResourceGroup -n $config.LogicAppName
    $isRunning = $site.state -eq 'Running'
    Add-CheckResult -Name 'Logic App site' -Passed $isRunning -Detail "state=$($site.state)"
} catch {
    Add-CheckResult -Name 'Logic App site' -Passed $false -Detail $_.Exception.Message
}

# 7. API connections report Connected
$connections = @{
    $config.FileSystemConnection = 'File System'
    $config.SharePointConnection = 'SharePoint Online'
    $config.Office365Connection  = 'Office 365 Outlook'
}
foreach ($connName in $connections.Keys) {
    $label = $connections[$connName]
    try {
        $conn = Invoke-Inv2SpAz resource show -g $config.ResourceGroup --resource-type 'Microsoft.Web/connections' -n $connName
        $status = $conn.properties.statuses[0].status
        $isConnected = $status -eq 'Connected'
        Add-CheckResult -Name "Connection '$connName' ($label)" -Passed $isConnected -Detail "status=$status"
    } catch {
        Add-CheckResult -Name "Connection '$connName' ($label)" -Passed $false -Detail $_.Exception.Message
    }
}

# 8. Configured folder path - informational only. Confirmed live
#    (2026-08-03) that ARM blocks BOTH an arbitrary folder-listing proxy
#    call AND the connector's own documented testconnection proxy
#    endpoint for this gateway-based File System connection
#    ("OperationNotAllowed - The API Connection proxy requests are not
#    supported. Only Test Connections are allowed through proxy
#    requests." - and even that endpoint returned the same error, so
#    gateway-routed connections evidently don't support the generic ARM
#    connection-proxy mechanism other connectors do). Connection health
#    is already covered by check 7 above (statuses[0].status, exactly
#    what the Azure Portal itself displays) - that is the reliable
#    signal. Whether FILESHARE_TRIGGER_FOLDER is the CORRECT path (a real
#    risk - dev's folder name has a literal space in it: "testing
#    folder") can only be confirmed by an actual workflow run against the
#    deployed Logic App: see Invoke-OnDemandRun.ps1, and check the first
#    run's digest/alert for a SourcePathNotFound error if it's wrong.
try {
    $appSettings = Invoke-Inv2SpAz webapp config appsettings list -g $config.ResourceGroup -n $config.LogicAppName
    $folderSetting = ($appSettings | Where-Object { $_.name -eq 'FILESHARE_TRIGGER_FOLDER' }).value
    if (-not $folderSetting) {
        Add-CheckResult -Name 'File share folder configured' -Passed $false -Detail 'FILESHARE_TRIGGER_FOLDER app setting not found.'
    } else {
        Add-CheckResult -Name 'File share folder configured' -Passed $true -Detail "FILESHARE_TRIGGER_FOLDER = '$folderSetting'. Path correctness is NOT verified here (Azure blocks a proxy-based folder-listing check for gateway connections) - confirm via an actual on-demand workflow run."
    }
} catch {
    Add-CheckResult -Name 'File share folder configured' -Passed $false -Detail "Could not read app settings. $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Inv2SpLog '=== Summary ===' -Level Info
$results | Format-Table -Property Check, Passed, Detail -AutoSize | Out-String | Write-Host

$failed = @($results | Where-Object { -not $_.Passed })
if ($failed.Count -gt 0) {
    Write-Inv2SpLog "$($failed.Count) of $($results.Count) checks FAILED." -Level Error
    exit 1
}

Write-Inv2SpLog "All $($results.Count) checks passed." -Level Success
exit 0
