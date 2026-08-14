#Requires -Version 7.0
<#
.SYNOPSIS
    Fires the wf-ondemand-copy workflow and returns the engine's run
    summary - the manual "run it now" path, and the resiliency check used
    before Enable-Triggers.ps1.
.DESCRIPTION
    Retrieves the trigger's callback URL and POSTs to it directly - the
    documented mechanism for invoking a Request trigger on a Standard
    Logic App workflow from outside the portal.

    The callback URL is fetched via the site's own runtime host
    (`https://{site}.azurewebsites.net/runtime/webhooks/workflow/...`)
    using the `workflow_extension` system key, NOT via the ARM
    `Microsoft.Web/sites/{site}/workflows/{name}/triggers/{name}/
    listCallbackUrl` control-plane action - that ARM action returns a
    bare `Not Found` against this site regardless of the caller's RBAC
    role (confirmed empirically, 2026-08-03 - the same class of gap as
    Enable-Triggers.ps1's original ARM PATCH approach, see PLAN.md
    section 17.7/17.13). The runtime-host route, authenticated with the
    site's own `workflow_extension` system key (`az functionapp keys
    list`), does work and returns the same signed callback URL shape.
.PARAMETER Environment
    'dev' or 'prod'.
.PARAMETER TimeoutSeconds
    How long to wait for the workflow to complete. Default 120.
.PARAMETER ShowSourceFolderContents
    Also fetch and display the raw List_Files_In_Folder action output
    from the wf-copy-invoices run this triggers - a direct, trustworthy
    way to see exactly what the source share's trigger folder currently
    contains (files and/or subfolders), without relying on the
    aggregated filesSeen/filesCopied counters alone. Useful on its own
    as a "what's actually in there" check, independent of validating a
    copy. Direct ARM-proxy folder listing is a hard API block
    (OperationNotAllowed: only Test Connections are allowed through
    proxy requests) - this is the only working way to see real folder
    contents short of a manual on-prem/UNC path check.
.EXAMPLE
    ./Invoke-OnDemandRun.ps1 -Environment dev
.EXAMPLE
    ./Invoke-OnDemandRun.ps1 -Environment dev -ShowSourceFolderContents
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [int]$TimeoutSeconds = 120,

    [switch]$ShowSourceFolderContents
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'modules/Inv2Sp.Common.psm1') -Force

$config = Get-Inv2SpEnvironmentConfig -Environment $Environment
Assert-Inv2SpAzLogin -Environment $Environment | Out-Null

if (-not (Test-Inv2SpActiveRole -Environment $Environment)) {
    throw "No active Contributor/Owner role on $($config.ResourceGroup). Run Invoke-PimActivation.ps1 -Environment $Environment first."
}

$workflowName = 'wf-ondemand-copy'
$triggerName = 'manual'

Write-Inv2SpLog "Retrieving the workflow_extension system key..." -Level Info
$keys = Invoke-Inv2SpAz functionapp keys list -g $config.ResourceGroup -n $config.LogicAppName
$extensionKey = $keys.systemKeys.workflow_extension
if (-not $extensionKey) {
    throw "Could not retrieve the workflow_extension system key for $($config.LogicAppName)."
}

Write-Inv2SpLog "Retrieving callback URL for $workflowName/$triggerName..." -Level Info
$listUrl = "https://$($config.LogicAppName).azurewebsites.net/runtime/webhooks/workflow/api/management/workflows/$workflowName/triggers/$triggerName/listCallbackUrl?api-version=2018-11-01"
$callback = Invoke-RestMethod -Uri $listUrl -Method Post -Headers @{ 'x-functions-key' = $extensionKey }

if (-not $callback.value) {
    throw "Could not retrieve a callback URL for $workflowName - has it been deployed yet? Run Deploy-Workflows.ps1 first."
}

Write-Inv2SpLog "Invoking $workflowName..." -Level Info
$response = Invoke-RestMethod -Uri $callback.value -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec $TimeoutSeconds

Write-Inv2SpLog 'Run summary:' -Level Success
$response | Format-List | Out-String | Write-Host

if ($response.filesFailed -gt 0 -or $response.filesAbandoned -gt 0) {
    Write-Inv2SpLog "Run completed with $($response.filesFailed) failed and $($response.filesAbandoned) abandoned file(s) - check the ProcessedFiles table / next digest for detail." -Level Warn
} else {
    Write-Inv2SpLog "Run completed cleanly: $($response.filesSeen) seen, $($response.filesCopied) copied, $($response.filesSkipped) skipped." -Level Success
}

if ($ShowSourceFolderContents) {
    Write-Inv2SpLog 'Fetching the raw List_Files_In_Folder output from the engine run this triggered...' -Level Info

    # wf-ondemand-copy's response.runId is wf-copy-invoices' OWN internal
    # RunId variable (a fresh guid(), unrelated to the ARM/runtime run
    # name) - there is no direct lookup from one to the other, so this
    # takes the most recently started wf-copy-invoices run instead. Safe
    # in practice: this script's own invocation is what just triggered
    # it, and concurrency=1 on the engine's trigger serializes any other
    # concurrent runs anyway.
    $runsUrl = "https://$($config.LogicAppName).azurewebsites.net/runtime/webhooks/workflow/api/management/workflows/wf-copy-invoices/runs?api-version=2018-11-01"
    $runs = (Invoke-RestMethod -Uri $runsUrl -Method Get -Headers @{ 'x-functions-key' = $extensionKey }).value
    $latestRun = $runs | Sort-Object { $_.properties.startTime } -Descending | Select-Object -First 1

    if (-not $latestRun) {
        Write-Inv2SpLog 'No wf-copy-invoices run history found yet.' -Level Warn
    } else {
        $actionUrl = "https://$($config.LogicAppName).azurewebsites.net/runtime/webhooks/workflow/api/management/workflows/wf-copy-invoices/runs/$($latestRun.name)/actions/List_Files_In_Folder?api-version=2018-11-01"
        $action = Invoke-RestMethod -Uri $actionUrl -Method Get -Headers @{ 'x-functions-key' = $extensionKey }

        Write-Inv2SpLog "List_Files_In_Folder status: $($action.properties.status) (code: $($action.properties.code))" -Level Info

        if ($action.properties.status -ne 'Succeeded') {
            Write-Inv2SpLog "List_Files_In_Folder did not succeed - folder contents could not be confirmed. Error: $($action.properties.error.message)" -Level Warn
        } elseif ($action.properties.outputsLink.uri) {
            $outputs = Invoke-RestMethod -Uri $action.properties.outputsLink.uri -Method Get
            $items = $outputs.body
            if (-not $items -or $items.Count -eq 0) {
                Write-Inv2SpLog "Source folder ('$($config.LogicAppName) -> FILESHARE_TRIGGER_FOLDER') is empty - no files, no subfolders." -Level Success
            } else {
                Write-Inv2SpLog "Source folder contains $($items.Count) item(s):" -Level Success
                $items | Format-Table -AutoSize | Out-String | Write-Host
            }
        }
    }
}

return $response
