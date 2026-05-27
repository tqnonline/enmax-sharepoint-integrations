function Write-PpLog {
    <#
    .SYNOPSIS
      Emits a structured log message to the appropriate PowerShell stream.

    .DESCRIPTION
      Routes messages based on Level:
        Info    -> Write-Host (information stream)
        Verbose -> Write-Verbose (respects -Verbose preference)
        Warning -> Write-Warning

    .PARAMETER Message
      The message text to emit.

    .PARAMETER Level
      One of 'Info', 'Verbose', 'Warning'. Defaults to 'Info'.

    .EXAMPLE
      Write-PpLog 'Authenticating pac CLI...'
      Write-PpLog 'Auth already exists, skipping create.' -Level Verbose
      Write-PpLog 'Environment URL not found in auth list.' -Level Warning
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,

        [ValidateSet('Info', 'Verbose', 'Warning')]
        [string]$Level = 'Info'
    )

    $prefix = '[Pp]'
    switch ($Level) {
        'Info'    { Write-Host "$prefix $Message" }
        'Verbose' { Write-Verbose "$prefix $Message" }
        'Warning' { Write-Warning "$prefix $Message" }
    }
}
