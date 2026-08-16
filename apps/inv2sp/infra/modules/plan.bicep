// ============================================================================
// App Service Plan module - Workflow Standard tier hosting the Logic App
// Standard site.
// ============================================================================

@description('App Service Plan name.')
param planName string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object = {}

@description('SKU name. Dev = WS1, Prod = WS2 (decision, 2026-08-01).')
@allowed(['WS1', 'WS2', 'WS3'])
param skuName string = 'WS1'

@description('Worker capacity (instance count).')
param capacity int = 1

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: 'WorkflowStandard'
    size: skuName
    family: 'WS'
    capacity: capacity
  }
  kind: 'elastic'
}

output id string = plan.id
output name string = plan.name
