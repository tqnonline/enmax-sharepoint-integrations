function Test-PpAppConfigCompleteness {
    <#
    .SYNOPSIS
      Audit App Configuration keys referenced in code against the seeded YAML union.

    .DESCRIPTION
      Thin wrapper around solution/scripts/audit_app_config_keys.py. Scans the Code
      App schema, plugins, workflows, and scripts for App Config key references and
      returns $false if any referenced key is missing from the seed union (base
      app_config.yaml + dev/uat overlays).

      Offline check — no Dataverse credentials required; reads only local files.

    .PARAMETER Strict
      Treat legacy Drawings*/Documents* fallback key references as errors if missing
      from the seed (passed through as --strict).

    .OUTPUTS
      [bool] $true if the audit passed, $false otherwise. Follows this module's
      Test-Pp* convention (see Test-PpFileExists) of returning a boolean rather than
      throwing, so callers can gate on the result without a try/catch.

    .EXAMPLE
      if (-not (Test-PpAppConfigCompleteness)) { throw "App Config audit failed" }

    .EXAMPLE
      Test-PpAppConfigCompleteness -Strict
    #>
    [CmdletBinding()]
    param(
        [switch]$Strict
    )

    $moduleRoot = Split-Path $PSScriptRoot -Parent
    $repoRoot   = Split-Path (Split-Path $moduleRoot -Parent) -Parent
    $script     = Join-Path $repoRoot 'solution/scripts/audit_app_config_keys.py'

    $cliArgs = @()
    if ($Strict) { $cliArgs += '--strict' }

    Write-PpLog "Auditing App Configuration key completeness..."
    Invoke-PpPythonScript -ScriptPath $script -Arguments $cliArgs

    return ($LASTEXITCODE -eq 0)
}
