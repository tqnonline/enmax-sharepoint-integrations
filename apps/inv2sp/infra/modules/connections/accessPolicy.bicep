// ============================================================================
// API connection access policy module - grants a managed identity
// permission to use an existing API connection, so the connection's own
// key never needs to appear in connections.json or app settings
// (decision: remove connection keys entirely - ADR-0013).
// ----------------------------------------------------------------------------
// Applies uniformly to adopted-existing connections (dev) and newly-created
// ones (prod) - this is a plain Microsoft.Web resource-provider write and
// does not require RBAC Administrator or any elevated permission beyond
// Contributor.
// ============================================================================

@description('Name of the existing API connection resource.')
param connectionName string

@description('Tenant id.')
param tenantId string = subscription().tenantId

@description('Object id of the principal to grant access to (the Logic App managed identity).')
param principalId string

resource connection 'Microsoft.Web/connections@2016-06-01' existing = {
  name: connectionName
}

resource accessPolicy 'Microsoft.Web/connections/accessPolicies@2016-06-01' = {
  parent: connection
  // BCP081 (unavoidable, non-blocking): this child resource type has no
  // Bicep type schema published, so property validation is skipped at
  // compile time. Deploys correctly regardless - this is the documented
  // Microsoft pattern for granting managed-identity access to API
  // connections; no alternative typed resource exists.
  name: guid(connection.id, principalId)
  properties: {
    principal: {
      type: 'ActiveDirectory'
      identity: {
        tenantId: tenantId
        objectId: principalId
      }
    }
  }
}
