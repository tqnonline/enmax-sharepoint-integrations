#Requires -Version 7
<#
.SYNOPSIS
  Thin shim over the PowerPlatform.Deploy module. Delegates to Register-PpPlugins.
  Build Enmax.AutoCAD.dll, update it in Dataverse, then idempotently register
  all Custom APIs and standard plugin steps defined in the assembly.

  Run from repo root:
      .\scripts\deploy-plugins.ps1
      .\scripts\deploy-plugins.ps1 -Environment uat
#>

param([string]$Environment = "dev")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module "$PSScriptRoot\PowerPlatform.Deploy\PowerPlatform.Deploy.psd1" -Force
Register-PpPlugins -Environment $Environment
