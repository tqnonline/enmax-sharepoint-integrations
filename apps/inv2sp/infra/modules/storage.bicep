// ============================================================================
// Storage account module
// ----------------------------------------------------------------------------
// Hosts: Logic App Standard runtime content share, and the 4 state tables
// used by the workflow engine (ProcessedFiles, RunLog, AlertState,
// FileRunEvents).
//
// IMPORTANT correction (security review, 2026-08-01): allowSharedKeyAccess
// is NEVER disabled by this module, regardless of enableHardening. Logic
// App / Functions Standard mounts its runtime content share over Azure
// Files via WEBSITE_CONTENTAZUREFILECONNECTIONSTRING, which requires
// account-key authentication - Azure Files content mounting does not
// support managed identity on this hosting plan. Disabling shared key here
// would break the platform itself, not just harden "our" data. The
// original design coupled allowSharedKeyAccess to enableHardening; that
// was wrong and has been corrected.
//
// enableHardening now controls ONLY network-level posture (public access +
// firewall default action). Our OWN application data (the 4 state tables)
// gets a genuinely least-privilege path once enableHardening=true: the
// Logic App managed identity is granted Storage Table Data Contributor
// ONLY (rbac.bicep) - not Blob or Queue, which this design does not use
// anywhere (files go directly to SharePoint, never staged in blob; no
// queue is used) - granting those roles would have been speculative,
// unused privilege.
// ============================================================================

@description('Storage account name (must be globally unique, lowercase, no dashes).')
@minLength(3)
@maxLength(24)
param storageAccountName string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object = {}

@description('Apply hardened network posture (public access disabled, firewall default-deny). Does NOT disable shared-key access - see header note on why that is a platform-level constraint, not a togglable choice.')
param enableHardening bool = false

var tableServiceName = 'default'
var tableNames = [
  'ProcessedFiles'
  'RunLog'
  'AlertState'
  'FileRunEvents'
]

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    // Always true - see header note. Required for the Functions/Workflow
    // host's Azure Files content share regardless of hardening posture.
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: enableHardening ? 'Disabled' : 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: enableHardening ? 'Deny' : 'Allow'
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-01-01' = {
  parent: storageAccount
  name: tableServiceName
}

resource tables 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = [for name in tableNames: {
  parent: tableService
  name: name
}]

output id string = storageAccount.id
output name string = storageAccount.name
@description('Runtime storage connection string. Consumed only when enableHardening=false (dev); prod uses managed identity via rbac.bicep once available. Marked @secure() so the value is redacted from deployment operation history, not just from the template source.')
@secure()
output connectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
output primaryBlobEndpoint string = storageAccount.properties.primaryEndpoints.blob
output primaryFileEndpoint string = storageAccount.properties.primaryEndpoints.file
output primaryQueueEndpoint string = storageAccount.properties.primaryEndpoints.queue
output primaryTableEndpoint string = storageAccount.properties.primaryEndpoints.table
