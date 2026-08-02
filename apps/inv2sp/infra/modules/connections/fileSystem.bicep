// ============================================================================
// File System API connection module.
// ----------------------------------------------------------------------------
// adoptExisting=true (dev): the connection already exists (created in the
// portal as "filesystem-2") and we lack gateway join permission in this
// subscription's gateway (it lives in a different subscription/RG we do not
// control) - so this module does NOT create or modify it, only reads back
// its connectionRuntimeUrl via an `existing` reference (ADR-0003/0039).
//
// adoptExisting=false (prod, once Network/DataOps grant join permission -
// see docs/prerequisites items G1-G3): creates the connection fresh. The
// file share password is passed as a secure param sourced from Key Vault by
// the deploying script - never stored in this template or in state.
// ============================================================================

@description('Connection resource name.')
param connectionName string

@description('Azure region - must match the on-premises data gateway registration region.')
param location string

@description('Resource tags.')
param tags object = {}

@description('When true, do not create/modify the connection - only reference the existing one by name (dev adopts-as-is).')
param adoptExisting bool = false

@description('Full resource id of the shared on-premises data gateway. Only used when adoptExisting=false.')
param dataGatewayResourceId string = ''

@description('Root folder / UNC path on the file share, e.g. \\\\server\\share. Only used when adoptExisting=false.')
param fileShareRootFolder string = ''

@description('Service account user name for the file share, e.g. DOMAIN\\svc-account. Only used when adoptExisting=false. Marked @secure() - the connector\'s own swagger classifies both username and password as securestring (security review, 2026-08-01).')
@secure()
param fileShareUsername string = ''

@description('Service account password for the file share. Only used when adoptExisting=false. Sourced from Key Vault by the deploying script.')
@secure()
param fileSharePassword string = ''

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
      id: subscriptionResourceId('Microsoft.Web/locations/managedApis', location, 'filesystem')
    }
    // The "gateway" parameter value for this connector's swagger is an
    // object ({id: ...}), but Bicep's static type for
    // Microsoft.Web/connections parameterValues (a dynamic, connector-
    // specific bag) declares it as string - a known typing gap for this
    // resource type, not a real error. any() suppresses the false-positive
    // BCP036 warning; the original ARM template (exported from this same
    // dev environment before this repo existed) used the identical shape
    // and deployed successfully.
    parameterValues: any({
      rootfolder: fileShareRootFolder
      authType: 'windows'
      username: fileShareUsername
      password: fileSharePassword
      gateway: {
        id: dataGatewayResourceId
      }
    })
  }
}

output id string = adoptExisting ? existingConnection.id : newConnection.id
output name string = connectionName
// connectionRuntimeUrl is a genuine runtime property this connector returns,
// but is absent from Bicep's static ApiConnectionDefinitionProperties type
// (BCP053) - a typing gap, not evidence the property doesn't exist. any()
// + safe-access (.?) is the standard workaround.
output connectionRuntimeUrl string = adoptExisting
  ? (any(existingConnection).properties.?connectionRuntimeUrl ?? '')
  : (any(newConnection).properties.?connectionRuntimeUrl ?? '')
