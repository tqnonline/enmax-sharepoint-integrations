#Requires -Version 7.0
<#
.SYNOPSIS
    Re-queues Abandoned files in ProcessedFiles for retry, after the
    underlying issue has been fixed.
.DESCRIPTION
    Abandoned is a deliberately terminal state (decision: explicit,
    auditable resolution - no automatic retry, to avoid masking a real
    unresolved issue and to avoid an accidental mass re-upload). This
    script is the only supported way back: it merges Status back to
    'Failed' and resets AttemptCount to 0, so the next engine run treats
    it as a fresh retry cycle with the full MAX_ATTEMPTS budget.

    Uses `az storage entity` with account-key auth (--auth-mode key) -
    the same auth model the Logic App itself uses for this table (see
    infra/modules/storage.bicep: allowSharedKeyAccess stays true always,
    a platform constraint of the Functions/Workflow content share, not a
    per-environment toggle), rather than requiring the operator's own AAD
    identity to hold Storage Table Data Contributor.
.PARAMETER Environment
    'dev' or 'prod'.
.PARAMETER FileName
    Reset only rows whose FileName matches (one or more). Omit to see
    and optionally reset every currently Abandoned row.
.PARAMETER Force
    Skip the interactive per-batch confirmation.
.EXAMPLE
    ./Reset-AbandonedFiles.ps1 -Environment dev -FileName invoice-123.pdf
.EXAMPLE
    ./Reset-AbandonedFiles.ps1 -Environment dev
    # lists every abandoned file, then asks before resetting all of them
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [string[]]$FileName,

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'modules/Inv2Sp.Common.psm1') -Force

$config = Get-Inv2SpEnvironmentConfig -Environment $Environment
Assert-Inv2SpAzLogin -Environment $Environment | Out-Null

Write-Inv2SpLog "Retrieving storage account key for $($config.StorageAccountName) (account-key auth, matching the Logic App's own auth model for this table)..." -Level Info
$accountKey = (Invoke-Inv2SpAz storage account keys list -g $config.ResourceGroup -n $config.StorageAccountName --query '[0].value' --output tsv).Trim()

$storageArgs = @('--account-name', $config.StorageAccountName, '--account-key', $accountKey, '--auth-mode', 'key')

Write-Inv2SpLog 'Querying ProcessedFiles for Abandoned rows...' -Level Info
$abandoned = Invoke-Inv2SpAz storage entity query --table-name 'ProcessedFiles' --filter "Status eq 'Abandoned'" @storageArgs

$rows = @($abandoned.items)
if ($FileName) {
    $rows = @($rows | Where-Object { $FileName -contains $_.FileName })
}

if ($rows.Count -eq 0) {
    Write-Inv2SpLog 'No matching Abandoned rows found - nothing to reset.' -Level Success
    exit 0
}

Write-Host "`nFound $($rows.Count) abandoned file(s):" -ForegroundColor Cyan
$rows | Select-Object FileName, SourcePath, ErrorCategory, AttemptCount, LastAttemptUtc | Format-Table -AutoSize | Out-String | Write-Host

if (-not $Force -and -not $PSCmdlet.ShouldProcess("$($rows.Count) file(s) in $Environment", 'Reset to Failed (retryable) with AttemptCount=0')) {
    Write-Inv2SpLog 'Cancelled - nothing was reset.' -Level Warn
    exit 0
}

$resetCount = 0
foreach ($row in $rows) {
    Invoke-Inv2SpAz storage entity merge --table-name 'ProcessedFiles' `
        --entity "PartitionKey=$($row.PartitionKey)" "RowKey=$($row.RowKey)" 'Status=Failed' 'AttemptCount=0' `
        @storageArgs | Out-Null
    Write-Inv2SpLog "Reset '$($row.FileName)' (was: $($row.ErrorCategory), attempt $($row.AttemptCount)) - will retry on the next run." -Level Success
    $resetCount++
}

Write-Inv2SpLog "$resetCount file(s) reset. They will be retried on the next scheduled/on-demand/file-trigger run." -Level Success
