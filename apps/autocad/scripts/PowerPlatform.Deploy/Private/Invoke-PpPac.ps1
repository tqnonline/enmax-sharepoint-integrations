function Invoke-PpPac {
    <#
    .SYNOPSIS
      Thin, mockable wrapper around the pac CLI executable.

    .DESCRIPTION
      Ensures $env:PATH includes the dotnet global tools directory where pac is installed,
      then invokes `pac` with the supplied arguments and returns its output.
      Callers should check $LASTEXITCODE via Assert-PpExitCode after each call.

      This wrapper exists so Pester tests can Mock it without needing the real pac CLI
      binary present in the test environment.

    .PARAMETER Arguments
      The argument list to pass to pac, accepted via ValueFromRemainingArguments so the
      caller can write: Invoke-PpPac auth list   (no array syntax needed).

    .OUTPUTS
      [string[]] stdout lines from pac.

    .EXAMPLE
      $list = Invoke-PpPac auth list
      Invoke-PpPac auth create --url $url --applicationId $id --clientSecret $s --tenant $t
      Assert-PpExitCode -Operation 'pac auth create'
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromRemainingArguments)]
        [string[]]$Arguments
    )

    # Ensure dotnet global tools (where pac lives) are on PATH
    if ($env:PATH -notlike "*$env:USERPROFILE\.dotnet\tools*") {
        $env:PATH += ";$env:USERPROFILE\.dotnet\tools"
    }

    return & pac @Arguments
}
