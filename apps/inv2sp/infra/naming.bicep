// ============================================================================
// INV2SP naming module
// ----------------------------------------------------------------------------
// Derives every resource name from (environment). Pattern observed in the
// existing dev resource group:
//   {type}-ENMAX-{bu}-{region}-{workload}-{env}
//
// Two irregularities exist in the ADOPTED dev environment and are
// intentionally preserved here (see docs/design/naming-convention.md):
//   1. Key Vault collapses "ENMAX-COR" to "ENMAXCOR" (no dash) - every other
//      resource type keeps the dash.
//   2. The dev file-share private endpoint is suffixed "-fileshare-PE"
//      while its siblings (blob/queue/table) use "-blob"/"-queue"/"-table".
//      New (prod) environments use the consistent "-file-pe" pattern.
//
// Dev's portal-created API connections also carry non-sequential names
// (filesystem-2, filesystem-3) because they were created outside IaC before
// this repository existed. Dev is ADOPTED as-is (decision #39 / ADR-0003) -
// its connection names are overridden via bicepparam, not derived here.
// ============================================================================

@description('Environment code. T = dev/UAT/QA, P = production.')
@allowed(['T', 'P'])
param environmentCode string

@description('Business unit code, e.g. COR.')
param businessUnit string = 'COR'

@description('Region code used in resource names, e.g. UW2 (West US 2).')
param regionCode string = 'UW2'

@description('Workload code used in resource names and the workload tag.')
param workload string = 'INV2SP'

var envUpper = toUpper(environmentCode)
var namePrefix = 'ENMAX-${businessUnit}-${regionCode}-${workload}-${envUpper}'
var namePrefixNoDash = 'ENMAX${businessUnit}-${regionCode}-${workload}-${envUpper}'
var storageSuffix = toLower('st${replace('enmax${businessUnit}${regionCode}${workload}${envUpper}', '-', '')}')

output resourceGroupName string = 'RG-${namePrefix}'
output appServicePlanName string = 'ASP-${namePrefix}'
output logicAppName string = 'LA-${namePrefix}'
// Key Vault: known exception - no dash between ENMAX and business unit.
output keyVaultName string = 'KV-${namePrefixNoDash}'
output storageAccountName string = storageSuffix
output appInsightsName string = 'AI-${namePrefix}'
output logAnalyticsWorkspaceName string = 'LAW-${namePrefix}'

// Private endpoint names follow the consistent pattern for NEW (prod)
// environments. Dev overrides its file-share PE name via bicepparam because
// the existing resource cannot be renamed without recreation.
output privateEndpointNames object = {
  blob: '${storageSuffix}-blob-pe'
  file: '${storageSuffix}-file-pe'
  queue: '${storageSuffix}-queue-pe'
  table: '${storageSuffix}-table-pe'
}

// Connection names for a clean (prod) environment. Dev overrides these via
// bicepparam to match its existing portal-created connections instead.
output connectionNames object = {
  fileSystem: 'filesystem'
  sharePointOnline: 'sharepointonline'
  office365: 'office365'
}

output tagsBase object = {
  ApplicationName: 'ENMAX-APINV to SP Integration'
  BusinessCriticality: 'High'
  DataClassification: 'Confidential'
  Project: 'CORP-SharePoint-Integrations'
  BusinessOwner: 'Dax Head'
  TechnicalOwner: 'Dax Head'
  CostAllocationCode: '36027'
  FinancialBU: 'ENMAX'
  workload: toLower(workload)
  managedBy: 'bicep'
}
