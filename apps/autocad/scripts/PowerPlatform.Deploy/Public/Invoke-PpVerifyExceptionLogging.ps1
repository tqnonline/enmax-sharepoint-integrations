function Invoke-PpVerifyExceptionLogging {
    <#
    .SYNOPSIS
      Force a flow failure and verify it is logged to enmax_autocadflowexception.

    .DESCRIPTION
      Thin wrapper around solution/scripts/verify_flow_exception_logging.py.
      Triggers the target flow (default: UAT_Teardown_SharePoint_Test_PDFs) with an
      invalid payload so it fails, then polls enmax_autocadflowexception for a new
      row tagged with that flow's display name. Intended as a post-deploy smoke test
      for ADR 0004's central exception logger (Child_Log_Flow_Exception).

      Credentials/target are read from the process environment (DATAVERSE_URL,
      ENVIRONMENT_ID) — callers are expected to have already exported these via
      Get-PpEnvConfig / Connect-PpDataverse.

    .PARAMETER Environment
      Target environment name, e.g. 'dev', 'uat'. Used for logging only —
      verify_flow_exception_logging.py itself reads DATAVERSE_URL/ENVIRONMENT_ID
      from the process environment.

    .PARAMETER FlowSlug
      Folder slug of the flow to trigger. Default (in the Python script):
      UAT_Teardown_SharePoint_Test_PDFs. Passed through via $env:VERIFY_FLOW_SLUG.

    .PARAMETER FlowTrigger
      HTTP trigger name on that flow. Default (in the Python script): Manual_Teardown.
      Passed through via $env:VERIFY_FLOW_TRIGGER.

    .EXAMPLE
      Invoke-PpVerifyExceptionLogging -Environment uat

      Forces the default UAT harness flow to fail and asserts an exception row appears.

    .NOTES
      This is a live, mutating smoke test — it triggers a real flow run in the target
      environment. There is no -DryRun; use -WhatIf to skip execution entirely.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)]
        [string]$Environment,

        [string]$FlowSlug,

        [string]$FlowTrigger
    )

    $moduleRoot = Split-Path $PSScriptRoot -Parent
    $repoRoot   = Split-Path (Split-Path $moduleRoot -Parent) -Parent
    $script     = Join-Path $repoRoot 'solution/scripts/verify_flow_exception_logging.py'

    if ($PSCmdlet.ShouldProcess($Environment, 'Force a flow failure and verify exception logging')) {
        if ($FlowSlug)    { $env:VERIFY_FLOW_SLUG = $FlowSlug }
        if ($FlowTrigger) { $env:VERIFY_FLOW_TRIGGER = $FlowTrigger }

        Write-PpLog "Verifying flow exception logging against $Environment..."
        Invoke-PpPythonScript -ScriptPath $script
        Assert-PpExitCode -Operation 'verify_flow_exception_logging.py'
    }
}
