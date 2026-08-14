// ============================================================================
// SharePoint Online API connection module.
// ----------------------------------------------------------------------------
// Uses delegated OAuth (not a service-principal / Sites.Selected app
// registration) - decision: operational uniformity with the Office 365
// Outlook connector, which only supports delegated OAuth. Both connections
// are authorized by signing in as the same account (ADR-0011/0012).
//
// adoptExisting: ALWAYS false in practice now, both environments (decision
// reversed 2026-08-03 - see below). This still supports true for
// completeness/future use, but is not currently exercised by either
// .bicepparam file.
//
// kind: 'V2' is required, not optional - see office365.bicep for the full
// rationale (ManagedServiceIdentity auth in connections.json requires
// accessPolicy support, which only V2-kind connections provide).
//
// Original decision (2026-06-xx, superseded): dev's sharepointonline
// connection already existed as Connected/authorized (rakmol@enmax.com),
// so adoptExisting=true avoided an unnecessary re-authorization step.
// Reversed 2026-08-03: live deployment against dev failed with
// "InvalidApiConnectionAccessPolicy... Access policies are not supported in
// 'V1' api connection 'sharepointonline'. Only 'V2' connections support
// access policies" - the adopted connection was V1-kind (predates the
// accessPolicy mechanism entirely) and cannot be retrofitted in place
// (kind is immutable). Without an accessPolicy, the Standard Logic App's
// managed identity cannot invoke this connector at runtime at all, so
// adopting the V1 connection as-is was a hard blocker, not a convenience
// trade-off. User approved deleting the V1 connection and recreating fresh
// as V2 in dev, accepting the one-time re-authorization cost.
// ============================================================================

@description('Connection resource name.')
param connectionName string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object = {}

@description('When true, do not create/modify the connection - only reference the existing one by name. Not currently used by either environment - see module header.')
param adoptExisting bool = false

resource existingConnection 'Microsoft.Web/connections@2016-06-01' existing = if (adoptExisting) {
  name: connectionName
}

resource newConnection 'Microsoft.Web/connections@2016-06-01' = if (!adoptExisting) {
  name: connectionName
  location: location
  kind: 'V2'
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
