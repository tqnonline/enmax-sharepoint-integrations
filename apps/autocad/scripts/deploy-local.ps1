#Requires -Version 7
<#
.SYNOPSIS
  Thin shim over the PowerPlatform.Deploy module. Delegates to Invoke-PpDeploy.
  Run the full deploy chain locally against a target environment (mirrors
  .github/workflows/cd-<env>.yml), for use when GitHub Actions CD is unavailable.
  Reads credentials from apps/code-app/.env.<environment> (gitignored; worktree
  falls back to the main repo).

.USAGE
  .\scripts\deploy-local.ps1                  # dev (default)
  .\scripts\deploy-local.ps1 -Environment uat
#>

param([string]$Environment = "dev")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module "$PSScriptRoot/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1" -Force
Invoke-PpDeploy -Environment $Environment
