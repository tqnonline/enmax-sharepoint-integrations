// ============================================================================
// Office 365 Outlook API connection module - used to send the daily digest
// and immediate failure alert emails.
// ----------------------------------------------------------------------------
// This connection does not exist in EITHER environment today - it is new in
// both. Delegated OAuth only (no service-principal option for this
// connector). Deploys unauthenticated; MUST be authorized interactively in
// the portal by the sending account before first use (dev: rakmol@enmax.com
// per user instruction, "will authenticate post deploy"; prod: the new M365
// service account once provisioned - see docs/prerequisites item M2).
// ============================================================================

@description('Connection resource name.')
param connectionName string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object = {}

resource connection 'Microsoft.Web/connections@2016-06-01' = {
  name: connectionName
  location: location
  tags: tags
  properties: {
    displayName: '${connectionName}-svc'
    api: {
      id: subscriptionResourceId('Microsoft.Web/locations/managedApis', location, 'office365')
    }
  }
}

output id string = connection.id
output name string = connection.name
// See fileSystem.bicep for why any()+safe-access is used here.
output connectionRuntimeUrl string = any(connection).properties.?connectionRuntimeUrl ?? ''
