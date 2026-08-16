#Requires -Version 7.0
<#
.SYNOPSIS
    Deploys the INV2SP Bicep infrastructure to dev or prod.
.DESCRIPTION
    Wraps `az deployment group what-if` / `create` with the correct
    .bicepparam file for the environment. Always runs what-if first as a
    safety preview, even when -WhatIf is not specified, so the operator
    sees the diff before confirming a real deployment.

    Handles the alertRecipients two-stage design (Action Groups cannot
    reference Key Vault secrets - see infra/modules/monitoring.bicep):
    reads the alertEmailTo secret back out of Key Vault (if it already
    exists - it won't on a genuine first bootstrap) and passes the
    resolved list as a parameter override, so the recipient list lives in
    exactly one place (Key Vault) rather than being duplicated into a
    committed parameter file.
.PARAMETER Environment
    'dev' or 'prod'.
.PARAMETER Force
    Skip the interactive confirmation prompt before a real deployment.
.EXAMPLE
    ./Deploy-Infrastructure.ps1 -Environment dev -WhatIf
.EXAMPLE
    ./Deploy-Infrastructure.ps1 -Environment dev
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'modules/Inv2Sp.Common.psm1') -Force

$config = Get-Inv2SpEnvironmentConfig -Environment $Environment
$repoRoot = Get-Inv2SpRepoRoot
$bicepParamPath = Join-Path $repoRoot $config.BicepParamFile
$mainBicepPath = Join-Path $repoRoot 'infra/main.bicep'

Assert-Inv2SpAzLogin -Environment $Environment | Out-Null

if (-not (Test-Inv2SpActiveRole -Environment $Environment)) {
    throw "No active Contributor/Owner role on $($config.ResourceGroup). Run Invoke-PimActivation.ps1 -Environment $Environment first."
}

# --- Bicep build validation (cheap, catches syntax errors before ARM does) ---
Write-Inv2SpLog 'Validating Bicep syntax (az bicep build)...' -Level Info
$buildOutput = & az bicep build --file $mainBicepPath --stdout 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "az bicep build failed:`n$buildOutput"
}
Write-Inv2SpLog 'Bicep build clean.' -Level Success

# --- Resolve alertRecipients from Key Vault, if it already exists ---
# (Action Groups cannot reference Key Vault secrets - see
# infra/modules/monitoring.bicep header. Not fatal if the vault or secret
# doesn't exist yet - that's the expected state on a genuine first
# bootstrap; monitoring simply won't deploy on this pass, matching
# main.bicep's `if (!empty(alertRecipients))` guard.)
$alertRecipientsJson = '[]'
try {
    $rawValue = Invoke-Inv2SpAz keyvault secret show --vault-name $config.KeyVaultName -n 'alertEmailTo' --query value --output tsv
    $rawValue = $rawValue.Trim()
    if ($rawValue -and $rawValue -notlike 'REPLACE-*') {
        # Semicolon-separated (decision, 2026-08-03) - matches the Office
        # 365 Outlook connector's own native "To" field format
        # (documented: "Specify email addresses separated by semicolons"),
        # so the same secret value is used unmodified as the workflows'
        # email "To" field AND split here only for the Action Group,
        # which needs one array entry per address.
        $recipients = $rawValue -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        $alertRecipientsJson = $recipients | ConvertTo-Json -AsArray -Compress
        Write-Inv2SpLog "Resolved $($recipients.Count) alert recipient(s) from Key Vault secret 'alertEmailTo'." -Level Info
    } else {
        Write-Inv2SpLog "Key Vault secret 'alertEmailTo' is missing or still a placeholder - monitoring alerts will not be deployed on this pass. Run Set-KeyVaultSecrets.ps1, then re-run this script." -Level Warn
    }
} catch {
    Write-Inv2SpLog "Could not read alertEmailTo from Key Vault (expected on a first bootstrap deploy) - monitoring alerts will not be deployed on this pass. $($_.Exception.Message)" -Level Warn
}

$deploymentName = "inv2sp-infra-$Environment-$(Get-Date -Format 'yyyyMMddHHmmss')"
$commonArgs = @(
    '--resource-group', $config.ResourceGroup
    '--template-file', $mainBicepPath
    '--parameters', $bicepParamPath
    '--parameters', "alertRecipients=$alertRecipientsJson"
    '--name', $deploymentName
)

# --- Always preview first ---
Write-Inv2SpLog "Running what-if against $($config.ResourceGroup)..." -Level Info
$whatIfOutput = & az deployment group what-if @commonArgs 2>&1
Write-Host $whatIfOutput
if ($LASTEXITCODE -ne 0) {
    throw "what-if failed:`n$whatIfOutput"
}

if ($WhatIfPreference) {
    Write-Inv2SpLog 'what-if only (per -WhatIf) - stopping here. Nothing was deployed.' -Level Info
    exit 0
}

if (-not $Force -and -not $PSCmdlet.ShouldProcess($config.ResourceGroup, "Deploy infrastructure ($Environment)")) {
    Write-Inv2SpLog 'Cancelled - nothing was deployed.' -Level Warn
    exit 0
}

# --- Real deployment ---
Write-Inv2SpLog "Deploying to $($config.ResourceGroup) (deployment name: $deploymentName)..." -Level Info
$createOutput = Invoke-Inv2SpAz deployment group create @commonArgs

Write-Inv2SpLog 'Deployment succeeded.' -Level Success
$createOutput.properties.outputs | Format-List | Out-String | Write-Host

if ($createOutput.properties.outputs.securityWarning.value) {
    Write-Inv2SpLog "Security posture note: $($createOutput.properties.outputs.securityWarning.value)" -Level Warn
}
