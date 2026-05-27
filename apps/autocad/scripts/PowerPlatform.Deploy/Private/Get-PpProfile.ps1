function Get-PpProfile {
    <#
    .SYNOPSIS
      Parses deploy.profile.yaml from the repository root.

    .DESCRIPTION
      Returns project identity values used by deployment scripts: entity_prefix,
      solution_name, business_unit, security_roles_file, and the tables sequence.
      Prefers powershell-yaml's ConvertFrom-Yaml if available; otherwise uses a
      minimal line-based parser suited to this file's known shape.

    .PARAMETER RepoRoot
      Optional. The repository root directory. Defaults to the grandparent of the
      module directory. Pass an explicit value in tests for isolation.

    .OUTPUTS
      [hashtable] with keys: entity_prefix, solution_name, business_unit,
      security_roles_file, tables (string[]).

    .EXAMPLE
      $profile = Get-PpProfile
      Write-Host $profile.solution_name
    #>
    [CmdletBinding()]
    param(
        [string]$RepoRoot
    )

    # This file is scripts/PowerPlatform.Deploy/Private/ — three levels up = repo root.
    if (-not $RepoRoot) {
        $RepoRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
    }

    $yamlFile = Join-Path $RepoRoot 'deploy.profile.yaml'
    if (-not (Test-Path $yamlFile)) {
        throw "Get-PpProfile: deploy.profile.yaml not found at $yamlFile"
    }

    $lines = Get-Content $yamlFile

    # Prefer powershell-yaml if available (avoids brittle line parsing)
    if (Get-Module -ListAvailable -Name 'powershell-yaml' -ErrorAction SilentlyContinue) {
        Import-Module powershell-yaml -ErrorAction Stop
        $parsed = $lines -join "`n" | ConvertFrom-Yaml
        return @{
            entity_prefix       = $parsed['entity_prefix']
            solution_name       = $parsed['solution_name']
            business_unit       = $parsed['business_unit']
            security_roles_file = $parsed['security_roles_file']
            tables              = [string[]]$parsed['tables']
        }
    }

    # Minimal line-based parser for this file's known shape:
    #   top-level scalars:  key: value
    #   tables block:       tables:\n  - item\n  - item
    $result = @{
        entity_prefix       = ''
        solution_name       = ''
        business_unit       = ''
        security_roles_file = ''
        tables              = @()
    }

    $inTables = $false
    $tablesList = [System.Collections.Generic.List[string]]::new()

    foreach ($line in $lines) {
        # Skip blank lines and comments
        if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }

        if ($inTables) {
            if ($line -match '^\s+-\s+(.+)$') {
                $tablesList.Add($Matches[1].Trim())
                continue
            } else {
                # Leaving the tables block
                $inTables = $false
            }
        }

        if ($line -match '^tables\s*:') {
            $inTables = $true
            continue
        }

        if ($line -match '^([a-z_]+)\s*:\s*(.+)$') {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim().Trim('"').Trim("'")
            if ($result.ContainsKey($key)) {
                $result[$key] = $val
            }
        }
    }

    $result['tables'] = [string[]]$tablesList.ToArray()
    return $result
}
