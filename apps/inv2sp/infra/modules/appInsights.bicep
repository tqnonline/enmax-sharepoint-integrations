// ============================================================================
// Telemetry module - Log Analytics workspace + workspace-based Application
// Insights, created per environment.
// ----------------------------------------------------------------------------
// The original dev deployment ("appInsights", 2026-06-09) failed with
// "The operation was forbidden by policy: Forbidden" - confirmed by
// exporting that deployment's template: it created a CLASSIC component
// (workspaceResourceId left empty because no workspace existed yet to
// point at). A tenant policy denies classic (non-workspace-based)
// Application Insights outright. Fix: create the workspace FIRST, always
// pass its resource id in - never leave workspaceResourceId empty
// (ADR-0016 / PLAN.md discovery log, 2026-08-01).
// ============================================================================

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string

@description('Application Insights component name.')
param appInsightsName string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object = {}

@description('Log Analytics retention in days.')
param retentionInDays int = 90

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    Request_Source: 'rest'
    // Always set - this is the fix for the policy-Deny described above.
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
output logAnalyticsWorkspaceName string = logAnalyticsWorkspace.name
output appInsightsId string = appInsights.id
output appInsightsName string = appInsights.name
output connectionString string = appInsights.properties.ConnectionString
output instrumentationKey string = appInsights.properties.InstrumentationKey
