#Requires -Version 7.0
<#
.SYNOPSIS
    Purges old rows from the FileRunEvents audit table (per-file-per-run
    outcome log, added 2026-08-11 - see PLAN.md 19.4). Azure Table Storage
    has no native TTL, so this is the only supported cleanup mechanism -
    retention was deliberately left indefinite/no-purge at build time, this
    script exists so a retention decision can be applied later without any
    workflow/infra redeploy.
.DESCRIPTION
    Two mutually exclusive modes:
      -OlderThanMonths N : retention-window mode (relative to TODAY). Keeps
                            the current calendar month plus the (N-1)
                            preceding months (N months of data total) and
                            deletes every FileRunEvents row in any older
                            monthly partition. E.g. today is 2026-08, N=3
                            keeps 2026-06/07/08 and deletes 2026-05 and
                            everything before it.
      -Month yyyy-MM      : one-off exact-month target, regardless of
                            today's date - deletes only that single
                            partition (e.g. for a manual, targeted purge).

    PartitionKey on FileRunEvents is 'yyyyMM' (see wf-copy-invoices'
    Upsert_FileRunEvent_* actions) - a lexical string comparison on that
    format sorts identically to chronological order, so partitions are
    identified and compared as plain strings throughout this script.

    There is no server-side "delete by partition" or "distinct partition
    keys" operation in Azure Table Storage - this script queries the
    table with a minimal PartitionKey/RowKey-only projection (cheap even
    at a full year of history at this project's scale: max ~17 files x
    ~96 runs/day only when the file backlog itself is that large - see
    PLAN.md 19.4's note on unbounded backlog growth, which is exactly the
    scenario this cleanup exists for) and deletes matching rows one at a
    time via `az storage entity delete` (the only delete primitive `az`
    exposes) - the same account-key auth model Reset-AbandonedFiles.ps1
    already uses for this same storage account, matching the Logic App's
    own auth model for these tables (see infra/modules/storage.bicep -
    allowSharedKeyAccess stays true always, a platform constraint, not a
    per-environment toggle).

    This is a permanent, irreversible delete (no soft-delete/recycle bin
    on Table Storage entities). Defaults to a dry-run preview; requires
    either an interactive confirmation or -Force to actually delete.
.PARAMETER Environment
    'dev' or 'prod'.
.PARAMETER OlderThanMonths
    Keep this many months of data (including the current month), relative
    to today's date. Deletes every older monthly partition. Minimum 1
    (keep only the current month; delete everything before it).
.PARAMETER Month
    Exact 'yyyy-MM' partition to delete, regardless of today's date.
.PARAMETER Force
    Skip the interactive confirmation and delete immediately.
.EXAMPLE
    ./Clear-FileRunEvents.ps1 -Environment dev -OlderThanMonths 3 -WhatIf
    # Preview only - shows which partitions/row counts would be deleted.
.EXAMPLE
    ./Clear-FileRunEvents.ps1 -Environment dev -OlderThanMonths 3
    # Keeps the current month + 2 prior months, deletes everything older,
    # after an interactive confirmation.
.EXAMPLE
    ./Clear-FileRunEvents.ps1 -Environment prod -Month 2026-05 -Force
    # Deletes only the 2026-05 partition, no confirmation prompt.
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High', DefaultParameterSetName = 'Retention')]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [Parameter(Mandatory, ParameterSetName = 'Retention')]
    [ValidateRange(1, 120)]
    [int]$OlderThanMonths,

    [Parameter(Mandatory, ParameterSetName = 'ExactMonth')]
    [ValidatePattern('^\d{4}-(0[1-9]|1[0-2])$')]
    [string]$Month,

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

if ($PSCmdlet.ParameterSetName -eq 'ExactMonth') {
    $targetPartitions = @($Month -replace '-', '')
    Write-Inv2SpLog "Exact-month mode: targeting partition '$($targetPartitions[0])' only." -Level Info
}
else {
    $keepFromMonth = (Get-Date -Day 1).AddMonths(-($OlderThanMonths - 1))
    $cutoffPartitionKey = $keepFromMonth.ToString('yyyyMM')
    Write-Inv2SpLog "Retention mode: keeping the current month plus $($OlderThanMonths - 1) prior month(s) - i.e. everything from '$cutoffPartitionKey' onward stays. Anything strictly before '$cutoffPartitionKey' will be deleted." -Level Info
}

Write-Inv2SpLog 'Querying FileRunEvents (PartitionKey/RowKey projection only) to identify matching rows...' -Level Info
$all = Invoke-Inv2SpAz storage entity query --table-name 'FileRunEvents' --select 'PartitionKey' 'RowKey' @storageArgs

$rows = @($all.items)
if ($rows.Count -eq 0) {
    Write-Inv2SpLog 'FileRunEvents is empty - nothing to clean up.' -Level Success
    exit 0
}

if ($PSCmdlet.ParameterSetName -eq 'ExactMonth') {
    $toDelete = @($rows | Where-Object { $_.PartitionKey -eq $targetPartitions[0] })
}
else {
    $toDelete = @($rows | Where-Object { [string]$_.PartitionKey -lt $cutoffPartitionKey })
}

if ($toDelete.Count -eq 0) {
    Write-Inv2SpLog 'No rows match the requested cleanup scope - nothing to delete.' -Level Success
    exit 0
}

$byPartition = @($toDelete | Group-Object PartitionKey | Sort-Object Name)
Write-Host "`nWould delete $($toDelete.Count) row(s) across $($byPartition.Count) monthly partition(s):" -ForegroundColor Cyan
$byPartition | Select-Object @{N = 'Partition'; E = { $_.Name } }, @{N = 'RowCount'; E = { $_.Count } } | Format-Table -AutoSize | Out-String | Write-Host

$keptPartitionCount = @($rows | Select-Object -ExpandProperty PartitionKey -Unique).Count - $byPartition.Count
Write-Inv2SpLog "$($rows.Count - $toDelete.Count) row(s) across $keptPartitionCount partition(s) would be kept." -Level Info

if (-not $Force -and -not $PSCmdlet.ShouldProcess("$($toDelete.Count) row(s) across $($byPartition.Count) partition(s) in FileRunEvents ($Environment)", 'Permanently delete (no soft-delete/recycle bin)')) {
    Write-Inv2SpLog 'Cancelled - nothing was deleted.' -Level Warn
    exit 0
}

$deletedCount = 0
$failedCount = 0
foreach ($row in $toDelete) {
    try {
        Invoke-Inv2SpAz storage entity delete --table-name 'FileRunEvents' `
            --partition-key $row.PartitionKey --row-key $row.RowKey `
            @storageArgs | Out-Null
        $deletedCount++
    }
    catch {
        Write-Inv2SpLog "Failed to delete PartitionKey='$($row.PartitionKey)' RowKey='$($row.RowKey)': $($_.Exception.Message)" -Level Error
        $failedCount++
    }
    if ($deletedCount % 100 -eq 0 -and $deletedCount -gt 0) {
        Write-Inv2SpLog "Progress: $deletedCount / $($toDelete.Count) deleted..." -Level Info
    }
}

if ($failedCount -gt 0) {
    Write-Inv2SpLog "$deletedCount row(s) deleted, $failedCount row(s) FAILED to delete - re-run the same command to retry (idempotent: already-deleted rows are simply absent from the next query)." -Level Warn
    exit 1
}

Write-Inv2SpLog "$deletedCount row(s) permanently deleted across $($byPartition.Count) monthly partition(s)." -Level Success
