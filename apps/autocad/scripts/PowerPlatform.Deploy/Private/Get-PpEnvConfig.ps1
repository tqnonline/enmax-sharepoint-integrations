function Get-PpEnvConfig {
    <#
    .SYNOPSIS
      Loads and parses a .env.<Environment> credential file for a Power Platform environment.

    .DESCRIPTION
      Reads KEY=VALUE pairs from apps\code-app\.env.<Environment> under $RepoRoot.
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

    $relPath = "apps\code-app\.env.$Environment"
    $envFile = Join-Path $RepoRoot $relPath

    # Worktree fallback: .env files are gitignored and may only exist in the main checkout
    if (-not (Test-Path $envFile)) {
        $gitCommonDir = & git -C $RepoRoot rev-parse --git-common-dir 2>$null
        if ($gitCommonDir) {
            $mainRepoRoot = Split-Path ([System.IO.Path]::GetFullPath($gitCommonDir)) -Parent
            $fallback = Join-Path $mainRepoRoot $relPath
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
