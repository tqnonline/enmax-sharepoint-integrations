function Connect-PpDataverse {
    <#
    .SYNOPSIS
      Authenticates the pac CLI against a Power Platform environment.

    .DESCRIPTION
      Loads credentials from .env.<Environment> via Get-PpEnvConfig, then idempotently
      ensures the pac CLI has an auth profile for that environment:
        1. Calls `pac auth list` via Invoke-PpPac.
        2. If the environment URL is NOT already in the list, creates a new auth profile
           with `pac auth create` (guarded by SupportsShouldProcess / -WhatIf).
        3. Selects index 1 so the profile is active for subsequent pac commands.

      Idempotent: re-running when the auth profile already exists skips the create step.

    .PARAMETER Environment
      The environment name matching a .env.<Environment> file, e.g. 'dev', 'uat'.

    .EXAMPLE
      Connect-PpDataverse -Environment dev

      Authenticates against the dev environment. Creates the auth profile if not present.

    .EXAMPLE
      Connect-PpDataverse -Environment uat -WhatIf

      Shows what pac auth create would do without actually creating the profile.
      Useful for dry-run verification in CI pipelines.

    .NOTES
      Requires pac CLI installed as a dotnet global tool (~/.dotnet/tools/pac).
      Credentials are read from apps\code-app\.env.<Environment> with a git-worktree
      fallback to the main repo checkout (see Get-PpEnvConfig).
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)]
        [string]$Environment,

        # User-auth path: select an existing pac profile by name (no .env / SPN required).
        [string]$PacProfileName
    )

    if ($PacProfileName) {
        Write-PpLog "Selecting pac user profile '$PacProfileName'..."
        if ($PSCmdlet.ShouldProcess($PacProfileName, 'pac auth select')) {
            Invoke-PpPac auth select --name $PacProfileName
            Assert-PpExitCode -Operation 'pac auth select'
            Assert-PpUserPacAuth -PacProfileName $PacProfileName
        }
        Write-PpLog "pac CLI auth ready (user profile: $PacProfileName)."
        return
    }

    $cfg = Get-PpEnvConfig -Environment $Environment

    Write-PpLog "Checking pac CLI auth for $($cfg.Url)..."
    $authList = Invoke-PpPac auth list

    $alreadyAuthed = ($authList -join '') -like "*$($cfg.Url)*"

    if ($alreadyAuthed) {
        Write-PpLog "Auth profile for $($cfg.Url) already exists — skipping create." -Level Verbose
    } else {
        if ($PSCmdlet.ShouldProcess($cfg.Url, 'pac auth create')) {
            Write-PpLog "Creating pac auth profile for $($cfg.Url)..."
            Invoke-PpPac auth create `
                --url             $cfg.Url `
                --applicationId   $cfg.ClientId `
                --clientSecret    $cfg.ClientSecret `
                --tenant          $cfg.TenantId
            Assert-PpExitCode -Operation 'pac auth create'
        }
    }

    # Select the profile whose Environment Url matches $cfg.Url. pac CLI 2.x only
    # supports --index / --name (not --environment), so parse `pac auth list`.
    if ($PSCmdlet.ShouldProcess($cfg.Url, 'pac auth select')) {
        $targetUrl = $cfg.Url.TrimEnd('/').ToLowerInvariant()
        $profileIndex = $null
        foreach ($line in $authList) {
            if ($line -match '\[(\d+)\]' -and $line.ToLowerInvariant().Contains($targetUrl)) {
                $profileIndex = [int]$Matches[1]
                break
            }
        }
        if ($null -eq $profileIndex) {
            throw "Connect-PpDataverse: no pac auth profile found for $($cfg.Url). Run 'pac auth list' and create or select the correct profile."
        }
        Write-PpLog "Selecting pac auth profile index $profileIndex for $($cfg.Url)..." -Level Verbose
        Invoke-PpPac auth select --index $profileIndex
        Assert-PpExitCode -Operation 'pac auth select'
    }

    Write-PpLog "pac CLI auth ready for $($cfg.Url)."
}
