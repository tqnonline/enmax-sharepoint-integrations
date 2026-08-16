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

    # Ensure the dotnet global-tools dir (where pac lives) is on PATH — cross-platform.
    # $HOME resolves the user home on Windows, Linux and macOS; the path separator is
    # ';' on Windows and ':' on Unix (via [IO.Path]::PathSeparator).
    $toolsDir = Join-Path $HOME '.dotnet/tools'
    $sep = [System.IO.Path]::PathSeparator
    if (($env:PATH -split [regex]::Escape($sep)) -notcontains $toolsDir) {
        $env:PATH = if ($env:PATH) { "$($env:PATH)$sep$toolsDir" } else { $toolsDir }
    }

    return & pac @Arguments
}
