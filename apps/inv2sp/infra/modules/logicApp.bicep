// ============================================================================
// Logic App Standard (site) module.
// ----------------------------------------------------------------------------
// IMPORTANT - virtualNetworkSubnetId is intentionally OMITTED from the
// resource body entirely when not supplied (empty string), rather than set
// to the current value. Azure Resource Manager evaluates linked-resource
// authorization (Microsoft.Network/virtualNetworks/subnets/join/action) on
// ANY deployment where this property is present in the template body, even
// when the value is unchanged - it is not conditioned on an actual diff.
// Dev's VNet integration was configured manually and we do not have subnet
// join permission there, so dev.bicepparam passes an empty string and this
// module never asserts the property, leaving the existing manual
// configuration untouched (ADR-0003 / ADR-0021, PLAN.md discovery log
// 2026-08-01). Prod passes the real subnet id once Network Team grants
// join permission (see docs/prerequisites, item N4).
// ============================================================================

@description('Logic App Standard (site) name.')
param logicAppName string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object = {}

@description('Workflow Standard plan resource id.')
param planId string

@description('Runtime storage account connection string.')
@secure()
param storageConnectionString string

@description('Separate storage connection string reference for the in-app azureTables service provider connector (ProcessedFiles/RunLog/AlertState/FileRunEvents). Same account, kept as a distinct app setting name from AzureWebJobsStorage by convention.')
@secure()
param tablesConnectionString string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('File System connection runtime URL. Empty until the connection is authorized/available.')
param fileSystemConnectionRuntimeUrl string = ''

@description('File System connection resource name (e.g. "filesystem-2" in dev, "filesystem" in prod) - needed by workflows/connections.json to build the connection resource id, distinct from the runtime URL.')
param fileSystemConnectionName string = 'filesystem'

@description('SharePoint Online connection runtime URL. Empty until OAuth is authorized.')
param sharePointConnectionRuntimeUrl string = ''

@description('SharePoint Online connection resource name - needed by workflows/connections.json.')
param sharePointConnectionName string = 'sharepointonline'

@description('Office 365 Outlook connection runtime URL. Empty until OAuth is authorized.')
param office365ConnectionRuntimeUrl string = ''

@description('Office 365 Outlook connection resource name - needed by workflows/connections.json.')
param office365ConnectionName string = 'office365'

@description('Folder on the file share that the engine watches (relative to the connection root folder). Dev/UAT = "LogicAppTest" (changed 2026-08-10, was "testing folder"), Prod = "APInvoices". These differ by full path, not just this folder name - see configuration-reference.md.')
param fileShareTriggerFolder string

@description('Folder successfully-copied files are moved to (ADR-0034). Empty disables archiving entirely - the safe default until a real path is confirmed for an environment (e.g. prod as of this writing).')
param fileShareArchiveFolder string = ''

@description('Target SharePoint site URL.')
param sharePointSiteUrl string

@description('Target SharePoint document library name.')
param sharePointLibraryName string

@description('Content type to stamp on the uploaded file.')
param sharePointContentType string

@description('Content type ID to stamp on the uploaded file.')
param sharePointContentTypeId string

@description('Target folder path within the SharePoint library.')
param sharePointTargetFolder string

@description('Key Vault URI (secret VALUES are never placed in app settings - workflows read them at runtime via the Key Vault connector using the managed identity, so recipient changes take effect on the next run rather than waiting out the ~24h app-setting Key Vault reference cache - decision #5).')
param keyVaultUri string

@description('Storage account name, used by monitoring/diagnostics wiring.')
param storageAccountName string

@description('Maximum retry attempts for a file before it is marked Abandoned.')
param maxAttempts int = 3

@description('Cooldown in minutes before a repeat systemic-error alert can fire again.')
param alertCooldownMinutes int = 60

@description('Daily digest send time, 24h HH:mm, in digestTimeZone.')
param digestScheduleTime string = '07:00'

@description('IANA-ish timezone name as accepted by Logic Apps Recurrence trigger.')
param digestTimeZone string = 'America/Edmonton'

@description('Kill-switch gate for wf-scheduled-copy (decision, 2026-08-03 - see PLAN.md section 17.7/17 addendum): the documented per-workflow Standard Logic App enable/disable management API could not be made to work reliably, so the trigger workflows themselves check this app setting and no-op if not exactly \'true\'. Defaults to false so a fresh deploy is safe-by-default; flip via `az functionapp config appsettings set` only after a validated on-demand run.')
param scheduledTriggerEnabled bool = false

@description('Email address for the digest footer escalation path (decision, 2026-08-10 - user request: business-ready digest emails with a clear support contact for finance/accounting recipients). Ticket-based escalation, not a distribution list.')
param supportContactEmail string = 'servicedesk@enmax.com'

@description('Subject line finance/accounting users should use when emailing supportContactEmail, so tickets route correctly.')
param supportContactSubject string = 'AP Invoices to SharePoint Integration Services'

@description('Existing subnet resource id for VNet integration. Empty string = property omitted entirely (see header note).')
param virtualNetworkSubnetId string = ''

@description('Apply hardened site config. When true and allowedIpRanges is non-empty, replaces the default Allow-all ingress rule with an explicit allow-list. When true and allowedIpRanges is empty, ingress still defaults to Allow-all - this is intentionally visible in output rather than silently claiming a restriction that was never configured (security review, 2026-08-01).')
param enableHardening bool = false

@description('CIDR ranges to allow when enableHardening=true. Leave empty to keep Allow-all even under hardening (e.g. while the real ranges - corporate network, GitHub-hosted runner ranges if SCM access is needed - are still being confirmed).')
param allowedIpRanges array = []

// IMPORTANT - `az deployment group what-if` cannot preview changes to this
// array. Microsoft.Web/sites does not reflect embedded
// properties.siteConfig.appSettings back through a normal GET the way it
// does other properties - app settings are actually managed as a distinct
// Microsoft.Web/sites/config ('appsettings') sub-resource internally, and
// what-if's diff engine only compares what a GET on the parent site
// resource returns. Practically: a clean/empty what-if result does NOT
// mean these settings are unchanged - it means what-if has nothing to say
// about them either way. The values below ARE applied correctly on an
// actual `az deployment group create` regardless. Verify app settings
// post-deploy with `az webapp config appsettings list`, not with what-if.
var baseAppSettings = [
  { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
  { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'dotnet' }
  { name: 'APP_KIND', value: 'workflowApp' }
  { name: 'AzureWebJobsStorage', value: storageConnectionString }
  { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING', value: storageConnectionString }
  { name: 'WEBSITE_CONTENTSHARE', value: toLower(logicAppName) }
  { name: 'AzureFunctionsJobHost__extensionBundle__id', value: 'Microsoft.Azure.Functions.ExtensionBundle.Workflows' }
  { name: 'AzureFunctionsJobHost__extensionBundle__version', value: '[1.*, 2.0.0)' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
  { name: 'WORKFLOWS_SUBSCRIPTION_ID', value: subscription().subscriptionId }
  { name: 'WORKFLOWS_RESOURCE_GROUP_NAME', value: resourceGroup().name }
  { name: 'WORKFLOWS_LOCATION_NAME', value: location }
  { name: 'FILESYSTEM_CONNECTION_RUNTIME_URL', value: fileSystemConnectionRuntimeUrl }
  { name: 'FILESYSTEM_CONNECTION_NAME', value: fileSystemConnectionName }
  { name: 'SHAREPOINTONLINE_CONNECTION_RUNTIME_URL', value: sharePointConnectionRuntimeUrl }
  { name: 'SHAREPOINTONLINE_CONNECTION_NAME', value: sharePointConnectionName }
  { name: 'OFFICE365_CONNECTION_RUNTIME_URL', value: office365ConnectionRuntimeUrl }
  { name: 'OFFICE365_CONNECTION_NAME', value: office365ConnectionName }
  { name: 'FILESHARE_TRIGGER_FOLDER', value: fileShareTriggerFolder }
  { name: 'FILESHARE_ARCHIVE_FOLDER', value: fileShareArchiveFolder }
  { name: 'SHAREPOINT_SITE_URL', value: sharePointSiteUrl }
  { name: 'SHAREPOINT_LIBRARY_NAME', value: sharePointLibraryName }
  { name: 'SHAREPOINT_CONTENT_TYPE', value: sharePointContentType }
  { name: 'SHAREPOINT_CONTENT_TYPE_ID', value: sharePointContentTypeId }
  { name: 'SHAREPOINT_TARGET_FOLDER', value: sharePointTargetFolder }
  { name: 'KEY_VAULT_URI', value: keyVaultUri }
  { name: 'FILE_SHARE_PASSWORD_SECRET_NAME', value: 'fileShareServiceAccountPassword' }
  { name: 'DIGEST_RECIPIENTS_SECRET_NAME', value: 'digestEmailTo' }
  { name: 'ALERT_RECIPIENTS_SECRET_NAME', value: 'alertEmailTo' }
  { name: 'STORAGE_ACCOUNT_NAME', value: storageAccountName }
  { name: 'TABLES_CONNECTION_STRING', value: tablesConnectionString }
  { name: 'MAX_ATTEMPTS', value: string(maxAttempts) }
  { name: 'ALERT_COOLDOWN_MINUTES', value: string(alertCooldownMinutes) }
  { name: 'DIGEST_SCHEDULE_TIME', value: digestScheduleTime }
  { name: 'DIGEST_TIMEZONE', value: digestTimeZone }
  { name: 'SCHEDULED_TRIGGER_ENABLED', value: string(scheduledTriggerEnabled) }
  { name: 'SUPPORT_CONTACT_EMAIL', value: supportContactEmail }
  { name: 'SUPPORT_CONTACT_SUBJECT', value: supportContactSubject }
]

var vnetAppSettings = enableHardening ? [
  { name: 'WEBSITE_CONTENTOVERVNET', value: '1' }
] : []

var allowAllRestriction = [
  {
    ipAddress: 'Any'
    action: 'Allow'
    priority: 2147483647
    name: 'Allow all'
    description: 'No IP restriction configured. If enableHardening is true and this rule is still active, allowedIpRanges was left empty - check main.bicep parameters.'
  }
]

var allowListRestrictions = [for (range, i) in allowedIpRanges: {
  ipAddress: range
  action: 'Allow'
  priority: 100 + i
  name: 'Allow-${i}'
  description: 'Explicit allow-list entry, hardened configuration.'
}]

// Genuinely restrictive only when both enableHardening=true AND at least one
// range is supplied - otherwise falls back to Allow-all rather than
// silently denying everything (which would lock out the deploying identity
// too) or silently claiming a restriction that isn't actually configured.
var effectiveIpSecurityRestrictions = (enableHardening && !empty(allowedIpRanges)) ? allowListRestrictions : allowAllRestriction

resource logicApp 'Microsoft.Web/sites@2023-12-01' = {
  name: logicAppName
  location: location
  tags: tags
  kind: 'functionapp,workflowapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: union(
    {
      serverFarmId: planId
      httpsOnly: true
      clientAffinityEnabled: false
      siteConfig: {
        ftpsState: 'Disabled'
        minTlsVersion: '1.2'
        use32BitWorkerProcess: false
        netFrameworkVersion: 'v6.0'
        ipSecurityRestrictions: effectiveIpSecurityRestrictions
        // false (not the Azure default of true once VNet-integrated) -
        // decision, 2026-08-03: dev's VNet integration was already
        // manually configured with Route All ON, which routes ALL
        // outbound traffic (including the filesystem connector's calls
        // to the on-premises data gateway's Azure Relay endpoint, a
        // public/non-RFC1918 destination) through the VNet. Without
        // confirmed NAT/egress for that traffic inside this VNet, the
        // gateway connection cannot be reached. Route All off lets
        // non-RFC1918 traffic bypass the VNet and go direct to
        // internet, restoring gateway connectivity, while calls to
        // actual VNet-joined/private-endpoint resources are unaffected
        // (those are routed by RFC1918 destination regardless of this
        // flag - see Microsoft's own regional VNet integration docs).
        vnetRouteAllEnabled: false
        appSettings: concat(baseAppSettings, vnetAppSettings)
      }
    },
    empty(virtualNetworkSubnetId) ? {} : { virtualNetworkSubnetId: virtualNetworkSubnetId }
  )
}

output id string = logicApp.id
output name string = logicApp.name
output defaultHostName string = logicApp.properties.defaultHostName
output principalId string = logicApp.identity.principalId
