using '../main.bicep'

// ============================================================================
// PRODUCTION environment (RG-ENMAX-COR-UW2-INV2SP-P, subscription
// ENMAXCORSB001P / 06c8e4ce-3403-4f63-922d-cf7ff3d9abc2)
// ----------------------------------------------------------------------------
// Genuinely greenfield - RG confirmed empty on 2026-08-01, all required
// resource providers already Registered. Several values below are TODO
// placeholders pending responses requested in
// handoff/production-prerequisites.md - each is flagged explicitly. Do not
// remove a TODO comment without confirming the real value first.
// ============================================================================

param environmentCode = 'P'
param location = 'westus2'
param keyVaultLocation = 'westus2' // clean - no region/name mismatch here, unlike dev

// Greenfield - vault is created fresh by this template.
param deployKeyVault = true
param existingKeyVaultName = '' // unused - deployKeyVault is true

// TODO: add the CI/CD service principal's object id once known
// (docs/prerequisites open item). rakmol-a@enmax.com's object id is
// included so the same human who runs the first bootstrap deployment can
// also manage secrets afterward.
param keyVaultDeployerObjectIds = [
  '216f02f3-1dca-4963-bc12-2ca78d0026c0' // rakmol-a@enmax.com
]

param enablePurgeProtection = true

// LEAVE FALSE (security review, 2026-08-01 - F-05, corrected): this flag
// was previously committed as `true`, which would silently reset the real
// fileShareServiceAccountPassword to a placeholder on every future
// redeploy if anyone forgot to flip it back. Bootstrap secret creation is
// handled entirely by scripts/Set-KeyVaultSecrets.ps1 instead (an
// unconditional `az keyvault secret set`, run once by hand after the first
// infrastructure deployment) - it is not this template's responsibility,
// and this flag should never need to be true in normal operation.
param createPlaceholderSecret = false

// TODO: flip to true only once Role Based Access Control Administrator has
// been granted on this resource group (handoff document Appendix A, item
// A1). Until then this MUST stay false, or the deployment will fail trying
// to assign roles without permission to do so.
param enableHardening = false

// TODO: populate once corporate network / required source ranges are
// confirmed, and enableHardening is true. Until then ingress stays
// Allow-all regardless (see logicApp.bicep) - this is surfaced explicitly
// in the deployment output's securityWarning, not left silently implicit.
param allowedIpRanges = []

param planSkuName = 'WS2'
param planCapacity = 1

// TODO: set to the real subnet resource id once Network Team grants
// join permission and returns it (handoff document item N4). Leaving this
// empty means the property is omitted entirely from the deployed
// template - see logicApp.bicep header for why that matters.
param virtualNetworkSubnetId = ''

// TODO: flip to true and populate privateEndpointSubnetId +
// privateDnsZoneIds once Network Team returns the 6 requested resource ids
// (handoff document items N1-N3).
param deployPrivateEndpoints = false
param privateEndpointSubnetId = ''
param privateDnsZoneIds = {
  blob: ''
  file: ''
  queue: ''
  table: ''
}

// TODO: flip to 'create' once DataOps confirms the gateway and grants join
// permission (handoff document items G1-G2). Until then this stays 'skip'
// so the rest of the deployment can proceed without a working file-share
// connection.
param fileSystemConnectionMode = 'skip'
param fileSystemConnectionName = 'filesystem'
param dataGatewayResourceId = '/subscriptions/f047a477-b231-4751-962b-b4ed4c1e349a/resourceGroups/RG-ENMAX-EDM-UW1-DataOpsFabric-D/providers/Microsoft.Web/connectionGateways/DataOpsFabric-Gateway-D' // assumed - see handoff doc item G1, DataOps must confirm
param fileShareRootFolder = '\\\\dcna30v004\\livelink_prd_data$'
param fileShareUsername = '' // TODO: DOMAIN\CPT_LogicApp_svc - confirm exact domain-qualified format with Identity team
param fileSharePassword = '' // supplied at deploy time via Set-KeyVaultSecrets.ps1 / Deploy-Infrastructure.ps1 -FileSharePassword, never committed here

param fileShareTriggerFolder = 'APInvoices'

// SharePoint does not require gateway access, so this can be created as
// soon as the resource group exists - it just deploys unauthenticated
// until the M365 service account signs in post-deploy (handoff document
// item M2).
param sharePointConnectionMode = 'create'
param sharePointConnectionName = 'sharepointonline'

param sharePointSiteUrl = 'https://enmaxcorp.sharepoint.com/sites/AP'
param sharePointLibraryName = 'Accounts Payable' // TODO: confirm this matches the library's internal/list name, not just its display name - see handoff document section 8
param sharePointContentType = 'Enmax Document'
param sharePointContentTypeId = '0x010100C5939496BD3E0F4287FA702FBCF7C0BE'
param sharePointTargetFolder = '/Accounts Payable'

param office365ConnectionName = 'office365'

// Left empty deliberately - never commit real distribution-list addresses.
// scripts/Deploy-All.ps1 reads the alertEmailTo Key Vault secret at deploy
// time and overrides this at the CLI layer.
param alertRecipients = []

param maxAttempts = 3
param alertCooldownMinutes = 60
param digestScheduleTime = '07:00'
param digestTimeZone = 'America/Edmonton'
param deadmanThresholdHours = 6

// Kill-switch gates - see dev.bicepparam for full rationale. Stay false
// until Invoke-OnDemandRun.ps1 has validated the engine end-to-end in
// prod and both office365/sharepointonline connections are authorized.
param scheduledTriggerEnabled = false

// Digest email footer escalation contact - see dev.bicepparam.
param supportContactEmail = 'servicedesk@enmax.com'
param supportContactSubject = 'AP Invoices to SharePoint Integration Services'
