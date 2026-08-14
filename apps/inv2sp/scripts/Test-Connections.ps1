#Requires -Version 7.0
<#
.SYNOPSIS
    Checks the status of all 3 INV2SP API connections (filesystem,
    sharepointonline, office365).
.DESCRIPTION
    Read-only. Used interactively and by .github/workflows/connection-health.yml
    (run daily) to catch a silently expired OAuth token before it causes a
    production failure - both sharepointonline and office365 use delegated
    OAuth, which can be revoked by password rotation or Conditional Access
    changes with no other warning (see PLAN.md decision record).

    Exits non-zero if any connection is not Connected, so it can gate a
    CI job or trigger an alert.
.PARAMETER Environment
    'dev' or 'prod'.
.EXAMPLE
    ./Test-Connections.ps1 -Environment dev
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
Assert-Inv2SpAzLogin -Environment $Environment | Out-Null

$connections = @(
    @{ Name = $config.FileSystemConnection; Label = 'File System' }
    @{ Name = $config.SharePointConnection; Label = 'SharePoint Online' }
    @{ Name = $config.Office365Connection; Label = 'Office 365 Outlook' }
)

$results = [System.Collections.Generic.List[pscustomobject]]::new()

foreach ($c in $connections) {
    try {
        $conn = Invoke-Inv2SpAz resource show -g $config.ResourceGroup --resource-type 'Microsoft.Web/connections' -n $c.Name
        $status = $conn.properties.statuses[0].status
        $isConnected = $status -eq 'Connected'
        $results.Add([pscustomobject]@{
            Connection = $c.Name
            Label      = $c.Label
            Status     = $status
            Healthy    = $isConnected
        })
        Write-Inv2SpLog "$($c.Label) ('$($c.Name)'): $status" -Level ($isConnected ? 'Success' : 'Error')
    } catch {
        $results.Add([pscustomobject]@{
            Connection = $c.Name
            Label      = $c.Label
            Status     = 'NotFound'
            Healthy    = $false
        })
        Write-Inv2SpLog "$($c.Label) ('$($c.Name)'): not found - $($_.Exception.Message)" -Level Error
    }
}

$unhealthy = @($results | Where-Object { -not $_.Healthy })
if ($unhealthy.Count -gt 0) {
    Write-Inv2SpLog "$($unhealthy.Count) connection(s) unhealthy. sharepointonline/office365 use delegated OAuth and must be re-authorized interactively in the Azure Portal (Connections -> Edit API connection -> Authorize) by the service account." -Level Error
    exit 1
}

Write-Inv2SpLog 'All connections healthy.' -Level Success
exit 0
