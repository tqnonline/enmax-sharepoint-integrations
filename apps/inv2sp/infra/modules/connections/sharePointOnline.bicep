// ============================================================================
// SharePoint Online API connection module.
// ----------------------------------------------------------------------------
// Uses delegated OAuth (not a service-principal / Sites.Selected app
// registration) - decision: operational uniformity with the Office 365
// Outlook connector, which only supports delegated OAuth. Both connections
// are authorized by signing in as the same account (ADR-0011/0012).
//
// adoptExisting=true (dev): the connection already exists and is Connected,
// authorized as rakmol@enmax.com. We do not recreate it - re-authorizing a
// working connection has no benefit and forces an unnecessary manual step.
//
// adoptExisting=false (prod): creates the connection fresh. It deploys in
// an unauthenticated state and MUST be authorized interactively in the
// portal by the M365 service account before first use (see
// docs/prerequisites item M2 - this cannot be automated).
// ============================================================================

@description('Connection resource name.')
param connectionName string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object = {}

@description('When true, do not create/modify the connection - only reference the existing one by name (dev adopts-as-is).')
param adoptExisting bool = false

resource existingConnection 'Microsoft.Web/connections@2016-06-01' existing = if (adoptExisting) {
  name: connectionName
}

resource newConnection 'Microsoft.Web/connections@2016-06-01' = if (!adoptExisting) {
  name: connectionName
  location: location
  tags: tags
  properties: {
    displayName: '${connectionName}-svc'
    api: {
      id: subscriptionResourceId('Microsoft.Web/locations/managedApis', location, 'sharepointonline')
    }
  }
}

output id string = adoptExisting ? existingConnection.id : newConnection.id
output name string = connectionName
// See fileSystem.bicep for why any()+safe-access is used here.
output connectionRuntimeUrl string = adoptExisting
  ? (any(existingConnection).properties.?connectionRuntimeUrl ?? '')
  : (any(newConnection).properties.?connectionRuntimeUrl ?? '')
