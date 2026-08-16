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
//
// kind: 'V2' is required, not optional - connections.json wires this
// connector with authentication.type=ManagedServiceIdentity (Microsoft's
// documented pattern for Standard Logic Apps invoking managed connectors),
// and that mechanism only works with a Microsoft.Web/connections/
// accessPolicies grant for the Logic App's system-assigned identity.
// V1-kind connections reject accessPolicy resources outright
// ("InvalidApiConnectionAccessPolicy" - confirmed empirically against a live
// deployment, 2026-08-03) - there is no fallback path for V1 with this auth
// model.
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
  kind: 'V2'
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
