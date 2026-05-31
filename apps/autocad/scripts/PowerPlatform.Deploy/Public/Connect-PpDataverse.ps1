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
        [string]$Environment
    )

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

    # Select by environment URL (not --index 1) so the right profile is
    # activated even when the machine has multiple pac auth profiles. --index 1
    # picks whichever profile sorted first, which can silently target the wrong
    # environment.
    if ($PSCmdlet.ShouldProcess($cfg.Url, 'pac auth select')) {
        Invoke-PpPac auth select --environment $cfg.Url
        Assert-PpExitCode -Operation 'pac auth select'
    }

    Write-PpLog "pac CLI auth ready for $($cfg.Url)."
}
