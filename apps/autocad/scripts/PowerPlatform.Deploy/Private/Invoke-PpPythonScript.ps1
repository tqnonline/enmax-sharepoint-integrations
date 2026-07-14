function Invoke-PpPythonScript {
    <#
    .SYNOPSIS
      Thin, mockable wrapper that runs a solution/scripts/*.py file as a subprocess.

    .DESCRIPTION
      Resolves a Python interpreter (prefers `python3`, falls back to `python` — macOS/
      Linux commonly expose only the former, Windows only the latter) and invokes
      $ScriptPath with $Arguments. Sets $LASTEXITCODE as a side effect so callers can
      check it via Assert-PpExitCode.

      This is the single seam Pester mocks to verify Python script invocations
      (deploy_flows.py, verify_flow_exception_logging.py, audit_app_config_keys.py)
      without running a real Python process.

    .PARAMETER ScriptPath
      Absolute path to the Python script to run.

    .PARAMETER Arguments
      Argument list to pass to the script.

    .EXAMPLE
      Invoke-PpPythonScript -ScriptPath $script -Arguments @('--catalog', 'prod', '--dry-run')
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ScriptPath,

        [string[]]$Arguments = @()
    )

    $python =
        if     (Get-Command 'python3' -ErrorAction SilentlyContinue) { 'python3' }
        elseif (Get-Command 'python'  -ErrorAction SilentlyContinue) { 'python' }
        else   { 'python3' }

    & $python $ScriptPath @Arguments
}
