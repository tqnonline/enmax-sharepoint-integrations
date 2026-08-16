function Assert-PpExitCode {
    <#
    .SYNOPSIS
      Throws a descriptive error if an exit code indicates failure.

    .DESCRIPTION
      Checks $ExitCode and throws "<Operation> failed (exit <ExitCode>)" when non-zero.
      Enforces Rule 12 (Fail loud) — never silently swallow a non-zero exit.

    .PARAMETER ExitCode
      The exit code to check. Defaults to $LASTEXITCODE if not supplied.

    .PARAMETER Operation
      Human-readable name of the operation that produced this exit code,
      included verbatim in the thrown error message.

    .EXAMPLE
      pac auth create ...
      Assert-PpExitCode -Operation 'pac auth create'

    .EXAMPLE
      Assert-PpExitCode -ExitCode $LASTEXITCODE -Operation 'pac solution import'
    #>
    [CmdletBinding()]
    param(
        [int]$ExitCode = $LASTEXITCODE,

        [Parameter(Mandatory)]
        [string]$Operation
    )

    if ($ExitCode -ne 0) {
        throw "$Operation failed (exit $ExitCode)"
    }
}
