function Get-PpEnvConfig {
    <#
    .SYNOPSIS
      Loads and parses a .env.<Environment> credential file for a Power Platform environment.

    .DESCRIPTION
      Reads KEY=VALUE pairs from code-app\.env.<Environment> under $RepoRoot.
      If the file is absent (e.g. inside a git worktree where .env files are gitignored),
      falls back to the main repo checkout by resolving the git common dir.
      Throws a clear error if the file is not found in either location.

    .PARAMETER Environment
      The environment name, e.g. 'dev', 'uat'. Used to locate .env.<Environment>.

    .PARAMETER RepoRoot
      Optional. The repository root directory. Defaults to the grandparent of the module
      directory (scripts/PowerPlatform.Deploy/ -> scripts/ -> repo root). Pass an explicit
      value in tests for isolation.

    .OUTPUTS
      [hashtable] with raw env keys (ENVIRONMENT_URL, ENVIRONMENT_ID, TENANT_ID, CLIENT_ID,
      CLIENT_SECRET, APP_ID, APP_DISPLAY_NAME) plus convenience aliases:
        Url           = ENVIRONMENT_URL
        ClientId      = CLIENT_ID
        ClientSecret  = CLIENT_SECRET
        TenantId      = TENANT_ID

    .EXAMPLE
      $cfg = Get-PpEnvConfig -Environment dev
      Write-Host $cfg.Url
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Environment,

        [string]$RepoRoot
    )

    # Default: this file is scripts/PowerPlatform.Deploy/Private/ — three levels up = repo root
    # (Private -> PowerPlatform.Deploy -> scripts -> repo root).
    if (-not $RepoRoot) {
        $RepoRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
    }

    # Env-only fast path. If the four credential keys are fully present in the process
    # environment (either as DATAVERSE_* canonical or as the short ENVIRONMENT_URL/CLIENT_ID/
    # CLIENT_SECRET/TENANT_ID names), build cfg from $env and skip the .env file lookup.
    # APP_ID / APP_DISPLAY_NAME / ENVIRONMENT_ID are pulled in if set. This lets CI invoke
    # Publish-PpCodeApp without a checked-in or copied .env file.
    $envUrl    = if ($env:DATAVERSE_URL)           { $env:DATAVERSE_URL }           else { $env:ENVIRONMENT_URL }
    $envCid    = if ($env:DATAVERSE_CLIENT_ID)     { $env:DATAVERSE_CLIENT_ID }     else { $env:CLIENT_ID }
    $envSecret = if ($env:DATAVERSE_CLIENT_SECRET) { $env:DATAVERSE_CLIENT_SECRET } else { $env:CLIENT_SECRET }
    $envTenant = if ($env:DATAVERSE_TENANT_ID)     { $env:DATAVERSE_TENANT_ID }     else { $env:TENANT_ID }
    if ($envUrl -and $envCid -and $envSecret -and $envTenant) {
        Write-Verbose "[Pp] Get-PpEnvConfig: env-only fast path (no .env file required)"
        $cfg = @{}
        $cfg['ENVIRONMENT_URL']  = $envUrl
        $cfg['CLIENT_ID']        = $envCid
        $cfg['CLIENT_SECRET']    = $envSecret
        $cfg['TENANT_ID']        = $envTenant
        $cfg['APP_ID']           = $env:APP_ID
        $cfg['APP_DISPLAY_NAME'] = $env:APP_DISPLAY_NAME
        $cfg['ENVIRONMENT_ID']   = $env:ENVIRONMENT_ID
        $cfg['Url']          = $envUrl
        $cfg['ClientId']     = $envCid
        $cfg['ClientSecret'] = $envSecret
        $cfg['TenantId']     = $envTenant
        return $cfg
    }

    $relPath = "code-app/.env.$Environment"
    $envFile = Join-Path $RepoRoot $relPath

    # Worktree fallback: .env files are gitignored and may only exist in the main checkout.
    # $RepoRoot is the APP root (scripts/PowerPlatform.Deploy/.. /.. /..), which since the
    # enmax-sharepoint-integrations monorepo merge is a SUBDIRECTORY of the git repo root
    # (apps/autocad), not the repo root itself. `git rev-parse --git-common-dir`'s parent is
    # the monorepo root, so it must be joined with the same subpath from this worktree's own
    # top-level down to $RepoRoot - not with $relPath directly, or the fallback would look for
    # <monorepo-root>/code-app/.env.<Environment> instead of
    # <monorepo-root>/apps/autocad/code-app/.env.<Environment>.
    if (-not (Test-Path $envFile)) {
        $gitCommonDir = & git -C $RepoRoot rev-parse --git-common-dir 2>$null
        $thisTopLevel = & git -C $RepoRoot rev-parse --show-toplevel 2>$null
        if ($gitCommonDir -and $thisTopLevel) {
            $mainRepoRoot = Split-Path ([System.IO.Path]::GetFullPath($gitCommonDir)) -Parent
            $repoRootFull = [System.IO.Path]::GetFullPath($RepoRoot)
            $topLevelFull = [System.IO.Path]::GetFullPath($thisTopLevel.Trim())
            $appSubPath   = $repoRootFull.Substring($topLevelFull.Length).TrimStart('/', '\')
            $fallback     = Join-Path $mainRepoRoot (Join-Path $appSubPath $relPath)
            if (Test-Path $fallback) {
                Write-Verbose "[Pp] .env.$Environment not in worktree — using $fallback"
                $envFile = $fallback
            }
        }
    }

    if (-not (Test-Path $envFile)) {
        throw "Get-PpEnvConfig: .env.$Environment not found. Expected at: $envFile (or in main repo checkout at the same relative path)."
    }

    $raw = @{}
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
        if ($line -match '^([^=]+)=(.*)$') {
            $key   = $Matches[1].Trim()
            $value = $Matches[2].Trim().Trim('"').Trim("'")
            $raw[$key] = $value
        }
    }

    # Convenience aliases alongside raw keys
    $raw['Url']          = $raw['ENVIRONMENT_URL']
    $raw['ClientId']     = $raw['CLIENT_ID']
    $raw['ClientSecret'] = $raw['CLIENT_SECRET']
    $raw['TenantId']     = $raw['TENANT_ID']

    return $raw
}
