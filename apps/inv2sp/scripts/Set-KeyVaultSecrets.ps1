#Requires -Version 7.0
<#
.SYNOPSIS
    Interactively sets INV2SP Key Vault secrets without ever exposing the
    value on the command line, in shell history, or in process listings.
.DESCRIPTION
    Prompts with Read-Host -AsSecureString for each secret, writes the
    value to a temporary file with restrictive permissions, calls
    `az keyvault secret set --file`, then overwrites and deletes the temp
    file. Never uses `az keyvault secret set --value`, which would leak
    the secret into shell history and process listings.

    This matches the pattern already used by whoever originally created
    fileShareServiceAccountPassword in dev - that secret carries the tag
    file-encoding: utf-8, which az keyvault secret set only adds when
    --file is used, confirming the same --file convention was already in
    use before this repository existed.
.PARAMETER Environment
    'dev' or 'prod'.
.PARAMETER SecretName
    Which secret(s) to set. Defaults to all three. Accepts multiple.
.EXAMPLE
    ./Set-KeyVaultSecrets.ps1 -Environment dev -SecretName digestEmailTo, alertEmailTo
.EXAMPLE
    ./Set-KeyVaultSecrets.ps1 -Environment dev
    # prompts for all three secrets in turn
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [ValidateSet('fileShareServiceAccountPassword', 'digestEmailTo', 'alertEmailTo')]
    [string[]]$SecretName = @('fileShareServiceAccountPassword', 'digestEmailTo', 'alertEmailTo')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'modules/Inv2Sp.Common.psm1') -Force

$config = Get-Inv2SpEnvironmentConfig -Environment $Environment
Assert-Inv2SpAzLogin -Environment $Environment | Out-Null

$secretPrompts = @{
    fileShareServiceAccountPassword = 'File share service account password (single value)'
    digestEmailTo                   = 'Daily digest recipients (semicolon-separated email addresses)'
    alertEmailTo                    = 'Immediate alert recipients (semicolon-separated email addresses)'
}

foreach ($name in $SecretName) {
    Write-Inv2SpLog "=== $name ===" -Level Info
    Write-Host $secretPrompts[$name] -ForegroundColor Cyan

    $secureValue = Read-Host -Prompt "Enter value for '$name'" -AsSecureString
    $confirmValue = Read-Host -Prompt 'Confirm value (re-enter)' -AsSecureString

    $plainValue = $secureValue | ConvertFrom-SecureStringPlain
    $confirmPlain = $confirmValue | ConvertFrom-SecureStringPlain

    if ($plainValue -ne $confirmPlain) {
        # Clear both from memory before failing.
        $plainValue = $null
        $confirmPlain = $null
        [System.GC]::Collect()
        Write-Inv2SpLog "Values for '$name' did not match - skipped. Nothing was written." -Level Error
        continue
    }
    $confirmPlain = $null

    if ([string]::IsNullOrWhiteSpace($plainValue)) {
        Write-Inv2SpLog "Empty value entered for '$name' - skipped." -Level Error
        $plainValue = $null
        continue
    }

    if (-not $PSCmdlet.ShouldProcess("$($config.KeyVaultName)/$name", 'Set Key Vault secret')) {
        $plainValue = $null
        continue
    }

    # Write to a temp file with owner-only permissions, never via --value
    # (which would appear in shell history and process listings).
    $tempFile = [System.IO.Path]::GetTempFileName()
    try {
        if ($IsLinux -or $IsMacOS) {
            & chmod 600 $tempFile
        }
        Set-Content -Path $tempFile -Value $plainValue -NoNewline -Encoding utf8NoBOM

        Invoke-Inv2SpAz keyvault secret set --vault-name $config.KeyVaultName -n $name --file $tempFile --encoding utf-8 | Out-Null
        Write-Inv2SpLog "Secret '$name' set successfully in $($config.KeyVaultName). Value not logged." -Level Success
    } finally {
        # Best-effort overwrite before delete - not a cryptographic
        # guarantee (SSDs/journaling filesystems may retain remnants),
        # but reduces the plaintext window on disk beyond what a plain
        # Remove-Item would.
        if (Test-Path $tempFile) {
            $randomContent = [System.Guid]::NewGuid().ToString() * 20
            Set-Content -Path $tempFile -Value $randomContent -NoNewline -ErrorAction SilentlyContinue
            Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
        }
        $plainValue = $null
    }
}

Write-Inv2SpLog 'Done. Run Test-Prerequisites.ps1 to confirm no secret is still a placeholder.' -Level Info
