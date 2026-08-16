#Requires -Version 7.0
<#
.SYNOPSIS
    Shared helper functions for INV2SP deployment scripts.
.DESCRIPTION
    Every script in this repo sources this module rather than the Az.*
    PowerShell modules (decision: pwsh + az CLI only - see PLAN.md /
    docs/decisions - avoids module version drift and a second, separate
    Azure auth context alongside the interactive `az login` / PIM session
    used throughout this project).

    All Azure calls go through Invoke-Inv2SpAz, which wraps `az` and checks
    $LASTEXITCODE explicitly - `az` does not throw PowerShell exceptions on
    failure by default, so every call must be checked.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Environment configuration - the single source of truth every script reads
# from, so a name never has to be retyped/re-guessed across scripts. Values
# match infra/params/{dev,prod}.bicepparam and infra/naming.bicep exactly.
# ---------------------------------------------------------------------------
$script:Inv2SpEnvironments = @{
    dev = @{
        EnvironmentCode      = 'T'
        SubscriptionId       = '707e24d6-3e70-435a-92c1-3d470271be2a'
        SubscriptionName     = 'ENMAXCORSB001D'
        ResourceGroup        = 'RG-ENMAX-COR-UW2-INV2SP-T'
        LogicAppName         = 'LA-ENMAX-COR-UW2-INV2SP-T'
        KeyVaultName         = 'KV-ENMAXCOR-UW2-INV2SP-T'
        StorageAccountName   = 'stenmaxcoruw2inv2spt'
        Location             = 'westus2'
        BicepParamFile       = 'infra/params/dev.bicepparam'
        FileSystemConnection = 'filesystem-2'
        SharePointConnection = 'sharepointonline'
        Office365Connection  = 'office365'
    }
    prod = @{
        EnvironmentCode      = 'P'
        SubscriptionId       = '06c8e4ce-3403-4f63-922d-cf7ff3d9abc2'
        SubscriptionName     = 'ENMAXCORSB001P'
        ResourceGroup        = 'RG-ENMAX-COR-UW2-INV2SP-P'
        LogicAppName         = 'LA-ENMAX-COR-UW2-INV2SP-P'
        KeyVaultName         = 'KV-ENMAXCOR-UW2-INV2SP-P'
        StorageAccountName   = 'stenmaxcoruw2inv2spp'
        Location             = 'westus2'
        BicepParamFile       = 'infra/params/prod.bicepparam'
        FileSystemConnection = 'filesystem'
        SharePointConnection = 'sharepointonline'
        Office365Connection  = 'office365'
    }
}

function Get-Inv2SpEnvironmentConfig {
    <#
    .SYNOPSIS
        Returns the resolved configuration hashtable for 'dev' or 'prod'.
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('dev', 'prod')]
        [string]$Environment
    )
    return $script:Inv2SpEnvironments[$Environment]
}

function Get-Inv2SpRepoRoot {
    <#
    .SYNOPSIS
        Resolves the repository root regardless of the caller's working
        directory, so scripts can be run from anywhere.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param()
    $moduleDir = Split-Path -Parent $PSCommandPath
    return (Resolve-Path (Join-Path -Path $moduleDir -ChildPath '..' -AdditionalChildPath '..')).Path
}

function Write-Inv2SpLog {
    <#
    .SYNOPSIS
        Structured console logging with a level prefix and timestamp.
        Never writes secret VALUES - callers are responsible for passing
        only names/identifiers, never values, to -Message.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, Position = 0)]
        [string]$Message,

        [ValidateSet('Info', 'Warn', 'Error', 'Success')]
        [string]$Level = 'Info'
    )
    $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $color = switch ($Level) {
        'Warn' { 'Yellow' }
        'Error' { 'Red' }
        'Success' { 'Green' }
        default { 'Gray' }
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Invoke-Inv2SpAz {
    <#
    .SYNOPSIS
        Runs an `az` CLI command, parses JSON output, and throws on failure.
    .DESCRIPTION
        `az` does not raise a PowerShell terminating error on failure by
        default - it writes to stderr and sets $LASTEXITCODE. This wrapper
        makes every az call behave like a normal PowerShell command that
        throws on error, so $ErrorActionPreference = 'Stop' and try/catch
        work as expected everywhere else in these scripts.

        KNOWN GOTCHA (found live, 2026-08-03): never pass az's short-form
        `-o <format>` output flag to this function - always use the
        long-form `--output <format>` instead. PowerShell's own parameter
        binder tries to resolve `-o` against this function's OWN
        parameters BEFORE the ValueFromRemainingArguments capture ever
        runs, and `-o` is ambiguous with PowerShell's built-in common
        parameters -OutVariable/-OutBuffer, so the call fails with
        "Parameter cannot be processed because the parameter name 'o' is
        ambiguous" - a PowerShell binder error, not an az error. This
        cannot be fixed inside this function without losing the ergonomic
        passthrough syntax every call site relies on; the only fix is
        never using the short form at any call site.
    .PARAMETER Arguments
        The az CLI arguments, e.g. @('group', 'show', '-n', $rgName).
        --output json and --only-show-errors are appended automatically.
        Use --output (not -o) if you need to override the format - see
        the gotcha above.
    .PARAMETER Raw
        Return the raw string output instead of parsing it as JSON (used
        for commands like `az bicep build` whose output is not JSON).
    #>
    [CmdletBinding()]
    [OutputType([object])]
    param(
        [Parameter(Mandatory, ValueFromRemainingArguments)]
        [string[]]$Arguments,

        [switch]$Raw
    )

    $fullArgs = $Arguments + @('--only-show-errors')
    if (-not $Raw -and ($Arguments -notcontains '--output') -and ($Arguments -notcontains '-o')) {
        $fullArgs += @('--output', 'json')
    }

    Write-Verbose "az $($fullArgs -join ' ')"
    $output = & az @fullArgs 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "az $($Arguments -join ' ') failed (exit $exitCode):`n$output"
    }

    if ($Raw -or [string]::IsNullOrWhiteSpace($output)) {
        return $output
    }

    try {
        return ($output | ConvertFrom-Json -Depth 100)
    } catch {
        # Not every az command returns JSON even with --output json (e.g.
        # some deployment commands print human-readable text on success) -
        # fall back to raw output rather than fail the whole call.
        return $output
    }
}

function Assert-Inv2SpAzLogin {
    <#
    .SYNOPSIS
        Verifies an active `az login` session exists and, if -Environment
        is supplied, that the correct subscription is selected.
    #>
    [CmdletBinding()]
    param(
        [ValidateSet('dev', 'prod')]
        [string]$Environment
    )

    try {
        $account = Invoke-Inv2SpAz account show
    } catch {
        throw "Not logged in to Azure CLI. Run 'az login' first.`n$_"
    }

    Write-Inv2SpLog "Signed in as $($account.user.name) on subscription '$($account.name)' ($($account.id))" -Level Info

    if ($Environment) {
        $config = Get-Inv2SpEnvironmentConfig -Environment $Environment
        if ($account.id -ne $config.SubscriptionId) {
            Write-Inv2SpLog "Current subscription ($($account.id)) does not match $Environment ($($config.SubscriptionId)). Switching..." -Level Warn
            Invoke-Inv2SpAz account set --subscription $config.SubscriptionId | Out-Null
            Write-Inv2SpLog "Switched to subscription $($config.SubscriptionId)" -Level Success
        }
    }

    return $account
}

function Test-Inv2SpActiveRole {
    <#
    .SYNOPSIS
        Checks whether the signed-in principal has an ACTIVE (not merely
        eligible/PIM-pending) Contributor or Owner role assignment on the
        target resource group. Does not activate PIM itself - see
        Invoke-PimActivation.ps1 for that.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('dev', 'prod')]
        [string]$Environment
    )

    $config = Get-Inv2SpEnvironmentConfig -Environment $Environment
    $account = Invoke-Inv2SpAz account show
    $scope = "/subscriptions/$($config.SubscriptionId)/resourceGroups/$($config.ResourceGroup)"

    $assignments = Invoke-Inv2SpAz role assignment list --assignee $account.user.name --scope $scope --include-inherited

    $activeRoles = @('Contributor', 'Owner', 'Role Based Access Control Administrator')
    $hasActive = @($assignments | Where-Object { $activeRoles -contains $_.roleDefinitionName }).Count -gt 0

    if ($hasActive) {
        Write-Inv2SpLog "Active role confirmed on $scope." -Level Success
    } else {
        Write-Inv2SpLog "No active Contributor/Owner role found on $scope - only Reader or an ELIGIBLE (not yet activated) assignment may exist. Run scripts/Invoke-PimActivation.ps1 -Environment $Environment first." -Level Warn
    }

    return $hasActive
}

function Get-Inv2SpKeyVaultSecret {
    <#
    .SYNOPSIS
        Reads a Key Vault secret VALUE and returns it as a SecureString,
        never as plaintext in the pipeline/console. Callers that need the
        plaintext (e.g. to pass to another az command) must explicitly
        convert it and are responsible for not writing it to a log.
    #>
    [CmdletBinding()]
    [OutputType([securestring])]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter(Mandatory)]
        [string]$SecretName
    )

    $result = Invoke-Inv2SpAz keyvault secret show --vault-name $VaultName -n $SecretName --query value --output tsv
    return (ConvertTo-SecureString -String $result -AsPlainText -Force)
}

function ConvertFrom-SecureStringPlain {
    <#
    .SYNOPSIS
        Converts a SecureString back to plaintext for the narrow cases
        where an external tool (az CLI) requires a plaintext argument.
        Named distinctly (not "ConvertTo-PlainText") to make every call
        site grep-able and deliberate.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [securestring]$SecureString
    )
    process {
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
        try {
            return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        } finally {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

Export-ModuleMember -Function @(
    'Get-Inv2SpEnvironmentConfig',
    'Get-Inv2SpRepoRoot',
    'Write-Inv2SpLog',
    'Invoke-Inv2SpAz',
    'Assert-Inv2SpAzLogin',
    'Test-Inv2SpActiveRole',
    'Get-Inv2SpKeyVaultSecret',
    'ConvertFrom-SecureStringPlain'
)
