// ============================================================================
// Key Vault access policy module - grants a principal (the Logic App's
// system-assigned managed identity) permission to read named secrets.
// Kept separate from keyVault.bicep because it depends on an identity
// created by a resource deployed in a different module (the Logic App
// site).
//
// "get" only, not "list" (security review, 2026-08-01 - F-08): the
// workflows always fetch specific, known secret names (see
// FILE_SHARE_PASSWORD_SECRET_NAME / DIGEST_RECIPIENTS_SECRET_NAME /
// ALERT_RECIPIENTS_SECRET_NAME app settings) and never need to enumerate
// the vault's contents. "list" would let the identity discover every
// secret name in the vault, which is unnecessary privilege for what this
// workflow actually does.
// ============================================================================

@description('Key Vault name to update.')
param keyVaultName string

@description('Tenant id.')
param tenantId string = subscription().tenantId

@description('Object id of the principal to grant secrets get access.')
param principalId string

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource accessPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  parent: keyVault
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: tenantId
        objectId: principalId
        permissions: {
          secrets: [
            'get'
          ]
        }
      }
    ]
  }
}
