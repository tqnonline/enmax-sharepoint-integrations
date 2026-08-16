// ============================================================================
// RBAC module - assigns data-plane roles to the Logic App's managed identity.
// ----------------------------------------------------------------------------
// Only meaningful once Role Based Access Control Administrator has been
// granted on the resource group (see docs/prerequisites, Appendix A / item
// A1). main.bicep only invokes this module when enableHardening=true.
//
// Scoped to Storage Table Data Contributor ONLY (security review, 2026-08-01
// - corrected from an earlier draft that also granted Storage Blob Data
// Owner, Storage Queue Data Contributor, Storage Account Contributor, and
// Monitoring Metrics Publisher). None of those are used anywhere in this
// design: files go directly from the network share to SharePoint and are
// never staged in blob storage, no queue is used anywhere, the workflow
// never manages storage account configuration, and no custom-metrics
// ingestion via Application Insights TrackMetric is implemented. Granting
// them would have been speculative, unused privilege on a system whose data
// is classified Confidential - the opposite of least privilege. Add a role
// here only when a concrete, implemented feature actually needs it.
//
// Role definition id verified against the ENMAX tenant on 2026-08-01.
// ============================================================================

@description('Principal id of the Logic App system-assigned managed identity.')
param principalId string

@description('Storage account resource id to grant the Table Data Contributor role on.')
param storageAccountId string

var storageTableDataContributor = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: last(split(storageAccountId, '/'))
}

resource tableDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccountId, principalId, storageTableDataContributor)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageTableDataContributor)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
