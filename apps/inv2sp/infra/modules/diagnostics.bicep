// ============================================================================
// Diagnostics module - adds a SECOND, independent diagnostic setting on the
// Logic App pointed at our own Log Analytics workspace.
// ----------------------------------------------------------------------------
// A tenant policy already auto-deploys a diagnostic setting named
// "setbypolicy" sending FunctionAppLogs + AllMetrics to a central SecOps
// workspace (enmaxuw2secla001, in a different subscription) - but leaves
// the WorkflowRuntime category disabled, which is the one that carries
// actual workflow run history. We do NOT edit that policy-managed setting
// (unclear whether we have rights over its destination workspace, and
// editing a policy-owned resource risks remediation fights). Azure allows
// up to 5 diagnostic settings per resource, so we add our own, independent,
// pointed at our own workspace, with WorkflowRuntime explicitly enabled
// (ADR-0017, PLAN.md dev access gap analysis 2026-08-01).
// ============================================================================

@description('Resource id of the Logic App (Microsoft.Web/sites) to enable diagnostics on.')
param logicAppId string

@description('Log Analytics workspace resource id to send logs/metrics to.')
param logAnalyticsWorkspaceId string

@description('Name of this diagnostic setting - deliberately distinct from the policy-managed "setbypolicy" setting.')
param diagnosticSettingName string = 'inv2sp-diagnostics'

resource logicApp 'Microsoft.Web/sites@2023-12-01' existing = {
  name: last(split(logicAppId, '/'))
}

resource diagnosticSetting 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: diagnosticSettingName
  scope: logicApp
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'FunctionAppLogs'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'WorkflowRuntime'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
  }
}
