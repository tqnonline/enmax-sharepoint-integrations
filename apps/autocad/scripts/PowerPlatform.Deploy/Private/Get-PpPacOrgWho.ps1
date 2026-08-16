function Get-PpPacOrgWho {
    <#
    .SYNOPSIS
      Parses `pac org who` output into a hashtable (Url, ENVIRONMENT_ID, UserEmail).
    #>
    [CmdletBinding()]
    param()

    $lines = Invoke-PpPac org who
    Assert-PpExitCode -Operation 'pac org who'

    $result = @{}
    foreach ($line in $lines) {
        if ($line -match 'Org URL:\s+(.+)')            { $result['Url'] = $Matches[1].Trim().TrimEnd('/') }
        if ($line -match 'Environment ID:\s+(.+)')     { $result['ENVIRONMENT_ID'] = $Matches[1].Trim() }
        if ($line -match 'User Email:\s+(.+)')         { $result['UserEmail'] = $Matches[1].Trim() }
        if ($line -match 'Friendly Name:\s+(.+)')      { $result['FriendlyName'] = $Matches[1].Trim() }
    }
    if (-not $result['Url']) {
        throw "Get-PpPacOrgWho: could not parse Org URL from pac org who. Is a user pac profile active?"
    }
    return $result
}

function Assert-PpUserPacAuth {
    <#
    .SYNOPSIS
      Ensures the active pac profile is a USER (not SPN) and optionally matches a profile name.
    #>
    [CmdletBinding()]
    param(
        [string]$PacProfileName,
        [string]$ExpectedUrlHost
    )

    $authLines = Invoke-PpPac auth list
    $activeRow = $authLines | Where-Object { $_ -match '\*' -and $_ -match 'https?://' } | Select-Object -First 1
    if (-not $activeRow) {
        throw "No active pac auth profile. Run: pac auth select --name `"$PacProfileName`""
    }
    if ($PacProfileName -and $activeRow -notmatch [regex]::Escape($PacProfileName)) {
        throw "Active pac profile is not '$PacProfileName'. Active: $($activeRow.Trim())"
    }
    if ($activeRow -match '\bApplication\b') {
        throw "Active pac profile is a Service Principal. Use a USER profile (e.g. pac auth create --name `"ENMAX DEV`" --url <url>)."
    }
    if ($ExpectedUrlHost -and $activeRow -notmatch [regex]::Escape($ExpectedUrlHost)) {
        throw "Active pac profile does not target $ExpectedUrlHost. Active: $($activeRow.Trim())"
    }
    Write-PpLog "Active pac auth OK (user): $($activeRow.Trim())" -Level Verbose
}
