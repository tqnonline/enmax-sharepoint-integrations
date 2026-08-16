#Requires -Version 7
<#
.SYNOPSIS
  Thin shim over the PowerPlatform.Deploy module. Delegates to Publish-PpCodeApp.
  Build the Code App and push it to a PowerApps environment.
  Reads credentials from code-app/.env.<environment> (gitignored).

.USAGE
  From repo root:  .\scripts\push-to-dev.ps1                 # dev (default)
                   .\scripts\push-to-dev.ps1 -Environment uat
#>

param([string]$Environment = "dev")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module "$PSScriptRoot/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1" -Force
Publish-PpCodeApp -Environment $Environment
