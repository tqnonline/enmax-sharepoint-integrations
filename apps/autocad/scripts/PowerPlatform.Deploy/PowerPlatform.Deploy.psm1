#Requires -Version 7
<#
.SYNOPSIS
  PowerPlatform.Deploy module loader.
  Dot-sources all Private helpers then all Public cmdlets, then exports the Public surface.
#>

# Dot-source Private functions (not exported)
foreach ($file in Get-ChildItem -Path "$PSScriptRoot\Private" -Filter '*.ps1' -Recurse) {
    . $file.FullName
}

# Dot-source Public functions (exported below)
foreach ($file in Get-ChildItem -Path "$PSScriptRoot\Public" -Filter '*.ps1' -Recurse) {
    . $file.FullName
}

Export-ModuleMember -Function @(
    'Connect-PpDataverse'
    'Invoke-PpDeploy'
    'Publish-PpCodeApp'
    'Register-PpPlugins'
)
