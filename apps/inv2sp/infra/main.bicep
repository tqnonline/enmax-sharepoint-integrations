// ============================================================================
// INV2SP - main orchestrator (resource-group scoped)
// ----------------------------------------------------------------------------
// See docs/design/naming-convention.md and docs/decisions/ for the reasoning
// behind every adopt-vs-manage / hardening-flag decision referenced below.
// Deploy via scripts/Deploy-Infrastructure.ps1, which wraps
// `az deployment group create|what-if` with the correct .bicepparam file.
// ============================================================================

targetScope = 'resourceGroup'

@description('Environment code. T = dev/UAT/QA, P = production.')
@allowed(['T', 'P'])
param environmentCode string

@description('Azure region for most resources.')
param location string = 'westus2'

@description('Azure region for the Key Vault. Dev is a known exception (deployed in westus despite its UW2 name) - see naming-convention.md. New environments should always use `location`.')
param keyVaultLocation string = location

// ---------------------------------------------------------------------------
// Key Vault
// ---------------------------------------------------------------------------
@description('When false (dev), the Key Vault already exists and is fully ADOPTED - this template never issues a PUT against Microsoft.KeyVault/vaults for it, because that resource type replaces the entire accessPolicies array on every write and dev\'s vault already holds policies (a human user + another application) that this template does not know about and must not remove. Only the Logic App managed identity access policy is added, via the additive accessPolicies/add child resource. When true (prod, greenfield), the vault is created fresh here.')
param deployKeyVault bool = false

@description('Existing Key Vault name to adopt when deployKeyVault=false.')
param existingKeyVaultName string = ''

@description('Object ids granted bootstrap secrets get/list/set when deployKeyVault=true (prod only).')
param keyVaultDeployerObjectIds array = []

@description('Enable purge protection on a freshly created vault (prod only).')
param enablePurgeProtection bool = false

@description('Create the file-share password secret with a placeholder value. Only meaningful when deployKeyVault=true on a genuine first bootstrap - see keyVault.bicep.')
param createPlaceholderSecret bool = false

// ---------------------------------------------------------------------------
// Hardening (Confidential-classification target state - see ADR-0014).
// Requires Role Based Access Control Administrator to have been granted
// (docs/prerequisites Appendix A, item A1) before this can safely be true.
// ---------------------------------------------------------------------------
@description('Apply the hardened target state: storage firewall closed, Key Vault purge protection, Storage Table Data Contributor granted to the managed identity (RBAC Administrator required - see docs/prerequisites Appendix A, item A1). Does NOT disable storage shared-key access - that is a platform constraint of the Functions/Workflow content share, not a togglable choice (security review, 2026-08-01 - see storage.bicep header). Off by default (dev); prod sets true only once RBAC Administrator has been granted.')
param enableHardening bool = false

@description('CIDR ranges allowed to reach the Logic App when enableHardening=true. Leave empty to keep Allow-all even under hardening while real ranges are confirmed - see logicApp.bicep.')
param allowedIpRanges array = []

// ---------------------------------------------------------------------------
// App Service Plan
// ---------------------------------------------------------------------------
@allowed(['WS1', 'WS2', 'WS3'])
param planSkuName string = 'WS1'
param planCapacity int = 1

// ---------------------------------------------------------------------------
// VNet integration - see logicApp.bicep header for why empty means omitted,
// not "no change".
// ---------------------------------------------------------------------------
@description('Existing subnet resource id for Logic App VNet integration. Empty = property omitted entirely from the deployed template (dev - manually configured, not managed here). Prod supplies the real id once Network Team grants subnet join permission (docs/prerequisites item N4).')
param virtualNetworkSubnetId string = ''

// ---------------------------------------------------------------------------
// Private endpoints - only meaningful once subnet + DNS zone ids exist.
// ---------------------------------------------------------------------------
@description('Deploy the 4 storage private endpoints (blob/file/queue/table). Dev\'s existing PEs are fully adopted and are never touched by this template regardless of this flag (see main.bicep body). Prod stays false until Network Team returns the 6 resource ids requested in docs/prerequisites, then flips true.')
param deployPrivateEndpoints bool = false

@description('Subnet resource id for the private endpoints. Required when deployPrivateEndpoints=true.')
param privateEndpointSubnetId string = ''

@description('Private DNS zone resource ids, keyed by sub-resource: blob, file, queue, table. Required when deployPrivateEndpoints=true.')
param privateDnsZoneIds object = {
  blob: ''
  file: ''
  queue: ''
  table: ''
}

// ---------------------------------------------------------------------------
// File System connection
// ---------------------------------------------------------------------------
@description('adopt = dev\'s existing filesystem-2 connection, never modified. create = deploy fresh (prod, once gateway join permission is granted - docs/prerequisites items G1-G3). skip = do not deploy this connection at all (prod, before that permission exists) - the Logic App still deploys, just without a working file-system connection yet.')
@allowed(['adopt', 'create', 'skip'])
param fileSystemConnectionMode string = 'adopt'

@description('Name of the connection. Dev overrides this to "filesystem-2" to match the existing portal-created resource; prod uses the clean "filesystem" name from naming.bicep.')
param fileSystemConnectionName string = 'filesystem'

@description('Full resource id of the shared on-premises data gateway. Only used when fileSystemConnectionMode=create.')
param dataGatewayResourceId string = ''

@description('Root folder / UNC path on the file share. Only used when fileSystemConnectionMode=create. Dev\'s existing adopted connection already has its own root folder configured in the portal and is not changed here.')
param fileShareRootFolder string = ''

@description('Service account user name for the file share, e.g. DOMAIN\\svc-account. Only used when fileSystemConnectionMode=create. Marked @secure() - the File System connector\'s own swagger classifies both username and password as securestring (security review, 2026-08-01).')
@secure()
param fileShareUsername string = ''

@description('Service account password. Only used when fileSystemConnectionMode=create. Sourced from Key Vault by the deploying script - never hardcoded.')
@secure()
param fileSharePassword string = ''

@description('Folder the engine watches, relative to the connection root folder. Dev/UAT = "testing folder" (with a space - verified), Prod = "APInvoices". These are genuinely different values per environment with no shared derivation.')
param fileShareTriggerFolder string

// ---------------------------------------------------------------------------
// SharePoint Online connection
// ---------------------------------------------------------------------------
@description('adopt = dev\'s existing, working, already-authorized sharepointonline connection - never recreated. create = deploy fresh (prod) - deploys unauthenticated and must be authorized interactively post-deploy (docs/prerequisites item M2).')
@allowed(['adopt', 'create'])
param sharePointConnectionMode string = 'adopt'

param sharePointConnectionName string = 'sharepointonline'
param sharePointSiteUrl string
param sharePointLibraryName string
param sharePointContentType string
param sharePointContentTypeId string
param sharePointTargetFolder string

// ---------------------------------------------------------------------------
// Office 365 Outlook connection - new in both environments, always created.
// ---------------------------------------------------------------------------
param office365ConnectionName string = 'office365'

// ---------------------------------------------------------------------------
// Reporting / monitoring
// ---------------------------------------------------------------------------
@description('Technical alert recipient email addresses. Action Groups cannot reference Key Vault - Deploy-All.ps1 reads the alertEmailTo secret back out after seeding it and passes the literal list here (single source of truth via ordered two-stage deploy).')
param alertRecipients array = []

param maxAttempts int = 3
param alertCooldownMinutes int = 60
param digestScheduleTime string = '07:00'
param digestTimeZone string = 'America/Edmonton'
param deadmanThresholdHours int = 2

// ============================================================================
// Naming
// ============================================================================
module naming 'naming.bicep' = {
  name: 'naming'
  params: {
    environmentCode: environmentCode
  }
}

// Tag KEY stays lowercase "environment" - matches the casing already used on
// live dev resources (plan/site tags). Tag VALUE also kept lowercase
// (toLower) to match the existing live convention ("t"/"p") rather than
// the uppercase T/P used for the environmentCode parameter itself (which
// stays uppercase for @allowed-value clarity) - confirmed via what-if
// against dev on 2026-08-01, which showed tags.environment "t" => "T" as
// an unintended cosmetic drift before this fix. The resource-group-level
// tag casing differs between dev ("Environment") and prod ("ENVIRONMENT")
// - both are currently empty and out of Bicep's control since RG tags are
// managed outside this template; only OUR resources' tags are asserted
// here.
var tags = union(naming.outputs.tagsBase, {
  environment: toLower(environmentCode)
})

// ============================================================================
// Key Vault
// ============================================================================
module keyVault 'modules/keyVault.bicep' = if (deployKeyVault) {
  name: 'keyVault'
  params: {
    keyVaultName: naming.outputs.keyVaultName
    location: keyVaultLocation
    tags: tags
    adminObjectIds: keyVaultDeployerObjectIds
    enablePurgeProtection: enablePurgeProtection
    // Deliberately NOT tied to enableHardening (security review, 2026-08-01
    // - F-04): the Logic App has no private network path to a
    // VNet-restricted Key Vault today (no Key Vault private endpoint is
    // built yet, and dev has no managed VNet integration - see
    // logicApp.bicep header). Disabling public access here without that
    // path would break every runtime secret read. Stays public until a
    // Key Vault private endpoint + confirmed VNet integration are added as
    // follow-up work - tracked in docs/operations/known-issues.md.
    publicNetworkAccessEnabled: true
    createPlaceholderSecret: createPlaceholderSecret
  }
}

var keyVaultName = deployKeyVault ? naming.outputs.keyVaultName : existingKeyVaultName
var keyVaultUri = 'https://${toLower(keyVaultName)}${environment().suffixes.keyvaultDns}/'

// ============================================================================
// Storage (+ ProcessedFiles / RunLog / AlertState tables)
// ============================================================================
module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    storageAccountName: naming.outputs.storageAccountName
    location: location
    tags: tags
    enableHardening: enableHardening
  }
}

// ============================================================================
// Telemetry (Log Analytics workspace + workspace-based Application Insights)
// ============================================================================
module telemetry 'modules/appInsights.bicep' = {
  name: 'telemetry'
  params: {
    logAnalyticsWorkspaceName: naming.outputs.logAnalyticsWorkspaceName
    appInsightsName: naming.outputs.appInsightsName
    location: location
    tags: tags
  }
}

// ============================================================================
// App Service Plan
// ============================================================================
module plan 'modules/plan.bicep' = {
  name: 'plan'
  params: {
    planName: naming.outputs.appServicePlanName
    location: location
    tags: tags
    skuName: planSkuName
    capacity: planCapacity
  }
}

// ============================================================================
// API connections
// ============================================================================
module fileSystemConnection 'modules/connections/fileSystem.bicep' = if (fileSystemConnectionMode != 'skip') {
  name: 'fileSystemConnection'
  params: {
    connectionName: fileSystemConnectionName
    location: location
    tags: tags
    adoptExisting: fileSystemConnectionMode == 'adopt'
    dataGatewayResourceId: dataGatewayResourceId
    fileShareRootFolder: fileShareRootFolder
    fileShareUsername: fileShareUsername
    fileSharePassword: fileSharePassword
  }
}

module sharePointConnection 'modules/connections/sharePointOnline.bicep' = {
  name: 'sharePointConnection'
  params: {
    connectionName: sharePointConnectionName
    location: location
    tags: tags
    adoptExisting: sharePointConnectionMode == 'adopt'
  }
}

module office365Connection 'modules/connections/office365.bicep' = {
  name: 'office365Connection'
  params: {
    connectionName: office365ConnectionName
    location: location
    tags: tags
  }
}

// ============================================================================
// Logic App Standard
// ============================================================================
module logicApp 'modules/logicApp.bicep' = {
  name: 'logicApp'
  params: {
    logicAppName: naming.outputs.logicAppName
    location: location
    tags: tags
    planId: plan.outputs.id
    storageConnectionString: storage.outputs.connectionString
    tablesConnectionString: storage.outputs.connectionString
    appInsightsConnectionString: telemetry.outputs.connectionString
    // Safe-access (.?) rather than a manual ternary guard: Bicep cannot
    // prove a hand-written condition is equivalent to the module's own
    // `if`, so a ternary still leaves a "may be null" warning. Safe-access
    // makes the null-ability explicit to the compiler instead.
    fileSystemConnectionRuntimeUrl: fileSystemConnection.?outputs.?connectionRuntimeUrl ?? ''
    fileSystemConnectionName: fileSystemConnectionName
    sharePointConnectionRuntimeUrl: sharePointConnection.outputs.connectionRuntimeUrl
    sharePointConnectionName: sharePointConnectionName
    office365ConnectionRuntimeUrl: office365Connection.outputs.connectionRuntimeUrl
    office365ConnectionName: office365ConnectionName
    fileShareTriggerFolder: fileShareTriggerFolder
    sharePointSiteUrl: sharePointSiteUrl
    sharePointLibraryName: sharePointLibraryName
    sharePointContentType: sharePointContentType
    sharePointContentTypeId: sharePointContentTypeId
    sharePointTargetFolder: sharePointTargetFolder
    keyVaultUri: keyVaultUri
    storageAccountName: storage.outputs.name
    maxAttempts: maxAttempts
    alertCooldownMinutes: alertCooldownMinutes
    digestScheduleTime: digestScheduleTime
    digestTimeZone: digestTimeZone
    virtualNetworkSubnetId: virtualNetworkSubnetId
    enableHardening: enableHardening
    allowedIpRanges: allowedIpRanges
  }
}

// ============================================================================
// Key Vault access policy for the Logic App managed identity (additive -
// safe for both adopted and freshly created vaults).
// ============================================================================
module keyVaultAccessPolicy 'modules/keyVaultAccessPolicy.bicep' = {
  name: 'keyVaultAccessPolicy'
  params: {
    keyVaultName: keyVaultName
    principalId: logicApp.outputs.principalId
  }
  dependsOn: [
    keyVault
  ]
}

// ============================================================================
// API connection access policies for the Logic App managed identity -
// removes connection keys entirely (ADR-0013). Safe for both adopted and
// newly created connections; plain Microsoft.Web write, no elevated
// permission required.
// ============================================================================
module fileSystemAccessPolicy 'modules/connections/accessPolicy.bicep' = if (fileSystemConnectionMode != 'skip') {
  name: 'fileSystemAccessPolicy'
  params: {
    connectionName: fileSystemConnectionName
    principalId: logicApp.outputs.principalId
  }
  // No explicit dependsOn needed: logicApp already references
  // fileSystemConnection.outputs.connectionRuntimeUrl, so the transitive
  // chain (this module -> logicApp -> fileSystemConnection) already
  // guarantees correct ordering.
}

module sharePointAccessPolicy 'modules/connections/accessPolicy.bicep' = {
  name: 'sharePointAccessPolicy'
  params: {
    connectionName: sharePointConnectionName
    principalId: logicApp.outputs.principalId
  }
  // Transitively ordered after sharePointConnection via logicApp - see note above.
}

module office365AccessPolicy 'modules/connections/accessPolicy.bicep' = {
  name: 'office365AccessPolicy'
  params: {
    connectionName: office365ConnectionName
    principalId: logicApp.outputs.principalId
  }
  // Transitively ordered after office365Connection via logicApp - see note above.
}

// ============================================================================
// Diagnostics - independent second diagnostic setting (see diagnostics.bicep
// header for why we do not edit the policy-managed "setbypolicy" setting).
// ============================================================================
module diagnostics 'modules/diagnostics.bicep' = {
  name: 'diagnostics'
  params: {
    logicAppId: logicApp.outputs.id
    logAnalyticsWorkspaceId: telemetry.outputs.logAnalyticsWorkspaceId
  }
}

// ============================================================================
// Private endpoints (prod only, once subnet/DNS ids are supplied)
// ----------------------------------------------------------------------------
// Deliberately 4 explicit module blocks rather than a for-loop: Bicep
// disallows referencing another module's outputs (naming.outputs.*) inside
// the array that drives a for-loop's iteration ("cannot be calculated at
// the start of the deployment" - BCP178), even though the values here are
// pure string derivations with no real dependency ordering concern. Four
// explicit blocks sidestep the restriction entirely and are no less
// readable at this size.
// ============================================================================
module privateEndpointBlob 'modules/privateEndpoint.bicep' = if (deployPrivateEndpoints) {
  name: 'pe-blob'
  params: {
    name: naming.outputs.privateEndpointNames.blob
    location: location
    tags: tags
    subnetId: privateEndpointSubnetId
    privateLinkServiceId: storage.outputs.id
    groupId: 'blob'
    privateDnsZoneId: privateDnsZoneIds.blob
  }
}

module privateEndpointFile 'modules/privateEndpoint.bicep' = if (deployPrivateEndpoints) {
  name: 'pe-file'
  params: {
    name: naming.outputs.privateEndpointNames.file
    location: location
    tags: tags
    subnetId: privateEndpointSubnetId
    privateLinkServiceId: storage.outputs.id
    groupId: 'file'
    privateDnsZoneId: privateDnsZoneIds.file
  }
}

module privateEndpointQueue 'modules/privateEndpoint.bicep' = if (deployPrivateEndpoints) {
  name: 'pe-queue'
  params: {
    name: naming.outputs.privateEndpointNames.queue
    location: location
    tags: tags
    subnetId: privateEndpointSubnetId
    privateLinkServiceId: storage.outputs.id
    groupId: 'queue'
    privateDnsZoneId: privateDnsZoneIds.queue
  }
}

module privateEndpointTable 'modules/privateEndpoint.bicep' = if (deployPrivateEndpoints) {
  name: 'pe-table'
  params: {
    name: naming.outputs.privateEndpointNames.table
    location: location
    tags: tags
    subnetId: privateEndpointSubnetId
    privateLinkServiceId: storage.outputs.id
    groupId: 'table'
    privateDnsZoneId: privateDnsZoneIds.table
  }
}

// ============================================================================
// RBAC (prod only, once RBAC Administrator has been granted - see rbac.bicep
// header). Coupled to enableHardening by design (ADR-0014).
// ============================================================================
module rbac 'modules/rbac.bicep' = if (enableHardening) {
  name: 'rbac'
  params: {
    principalId: logicApp.outputs.principalId
    storageAccountId: storage.outputs.id
  }
}

// ============================================================================
// Monitoring
// ============================================================================
module monitoring 'modules/monitoring.bicep' = if (!empty(alertRecipients)) {
  name: 'monitoring'
  params: {
    logicAppId: logicApp.outputs.id
    tags: tags
    alertRecipients: alertRecipients
    deadmanThresholdHours: deadmanThresholdHours
    environmentSuffix: environmentCode
  }
}

// ============================================================================
// Outputs
// ============================================================================
output logicAppName string = naming.outputs.logicAppName
output logicAppPrincipalId string = logicApp.outputs.principalId
output keyVaultName string = keyVaultName
output keyVaultUri string = keyVaultUri
output storageAccountName string = storage.outputs.name
output appInsightsName string = naming.outputs.appInsightsName
output logAnalyticsWorkspaceName string = naming.outputs.logAnalyticsWorkspaceName

@description('Loud, always-present deployment output flagging the current security posture (security review, 2026-08-01 - F-01; corrected 2026-08-01 after correctness review found the original version short-circuited to empty whenever enableHardening=true, hiding the case where hardening is on but allowedIpRanges is still empty - ingress stays Allow-all in exactly that state too). Empty string when there is nothing to flag.')
output securityWarning string = join(filter([
    (environmentCode == 'P' && !enableHardening) ? 'PRODUCTION with enableHardening=false: storage is publicly reachable over the internet (shared-key auth) and the Logic App accepts inbound traffic from any IP address. This is expected only until Role Based Access Control Administrator is granted (docs/prerequisites Appendix A) - do not treat this as a stable end state.' : ''
    (empty(allowedIpRanges) && enableHardening) ? 'No allowedIpRanges configured despite enableHardening=true - Logic App ingress is still Allow-all.' : ''
    (empty(allowedIpRanges) && !enableHardening) ? 'No allowedIpRanges configured - Logic App ingress is Allow-all.' : ''
  ], item => !empty(item)), ' | ')
