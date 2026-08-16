// ============================================================================
// Private endpoint module - reusable, one instance per storage sub-resource
// (blob/file/queue/table). Only invoked when subnet + DNS zone resource ids
// are available (prod, once Network Team responds - see docs/prerequisites
// item N1-N4). Dev's existing private endpoints are ADOPTED as-is and are
// never managed by this module (ADR-0003/0039) - we lack subnet join
// permission in the dev VNet's resource group and recreating them would be
// both unnecessary and unsafe.
// ============================================================================

@description('Private endpoint name.')
param name string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object = {}

@description('Subnet resource id to deploy the private endpoint into.')
param subnetId string

@description('Resource id of the target resource (e.g. the storage account).')
param privateLinkServiceId string

@description('Sub-resource group id, e.g. blob, file, queue, table.')
param groupId string

@description('Private DNS zone resource id to link for automatic record registration.')
param privateDnsZoneId string

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: name
        properties: {
          privateLinkServiceId: privateLinkServiceId
          groupIds: [
            groupId
          ]
        }
      }
    ]
  }
}

resource dnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: groupId
        properties: {
          privateDnsZoneId: privateDnsZoneId
        }
      }
    ]
  }
}

output id string = privateEndpoint.id
output name string = privateEndpoint.name
