// ============================================================================
// Key Vault module
// ----------------------------------------------------------------------------
// Access-policy model (not RBAC) - matches the ORIGINAL dev deployment and
// remains the only option until Role Based Access Control Administrator is
// granted on the resource group (see docs/prerequisites, Appendix A / ADR-0018).
// Hardening flag adds purge protection; RBAC authorization itself is a
// separate, larger change tracked as future work once permissions allow it
// (would require re-granting every access policy as a role assignment).
// ============================================================================

@description('Key Vault name.')
param keyVaultName string

@description('Azure region. NOTE: dev is deployed in westus despite its UW2 name (known exception, see naming-convention.md). Prod uses westus2.')
param location string

@description('Resource tags.')
param tags object = {}

@description('Tenant id used for access policies.')
param tenantId string = subscription().tenantId

@description('Object ids granted get/list/set on secrets (humans/CI identities). Logic App MI access is granted separately once the site exists.')
param adminObjectIds array = []

@description('Enable purge protection (irreversible once enabled). Recommended for prod, off for dev.')
param enablePurgeProtection bool = false

@description('Enable public network access. Recommended false for hardened (prod) environments once a private endpoint exists.')
param publicNetworkAccessEnabled bool = true

@description('Name of the file-share service-account password secret.')
param secretName string = 'fileShareServiceAccountPassword'

@description('Create the secret with a placeholder value on this run ONLY - set true purely for first bootstrap (fresh/prod vault) so the real value can be set afterward via Set-KeyVaultSecrets.ps1. Leave false on every subsequent run to avoid ever overwriting a real value that has since been set.')
param createPlaceholderSecret bool = false

@description('Placeholder value used ONLY when createPlaceholderSecret=true on a first-bootstrap run.')
param placeholderValue string = 'REPLACE-VIA-Set-KeyVaultSecrets.ps1'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: false
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: enablePurgeProtection ? true : null
    publicNetworkAccess: publicNetworkAccessEnabled ? 'Enabled' : 'Disabled'
    accessPolicies: [for oid in adminObjectIds: {
      tenantId: tenantId
      objectId: oid
      permissions: {
        secrets: [
          'get'
          'list'
          'set'
        ]
      }
    }]
  }
}

output id string = keyVault.id
output name string = keyVault.name
output uri string = keyVault.properties.vaultUri

resource placeholderSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (createPlaceholderSecret) {
  parent: keyVault
  name: secretName
  properties: {
    value: placeholderValue
  }
}
