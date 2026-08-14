using '../main.bicep'

// ============================================================================
// DEV / UAT / QA environment (RG-ENMAX-COR-UW2-INV2SP-T)
// ----------------------------------------------------------------------------
// This environment is ADOPTED as-is (ADR-0003/0039) - existing resources with
// irregular names (Key Vault region, filesystem-2/-3 numbering, the
// -fileshare-PE suffix) are preserved rather than recreated, because
// recreating them would force a Key Vault soft-delete conflict, three
// connection re-authorizations, and re-entry of a file-share password that
// nobody currently knows (the secret has not been touched since 2026-06-09
// and is very likely still its bootstrap placeholder).
// ============================================================================

param environmentCode = 'T'
param location = 'westus2'

// Known exception: dev's Key Vault is in westus, contradicting its own UW2
// name. This is a LIVE, active problem (a recent tenant policy remediation
// deployment failed trying to co-locate a diagnostic setting with a
// westus2 resource) - documented, not silently "fixed" here, because fixing
// it means recreating the vault. See docs/operations/known-issues.md.
param keyVaultLocation = 'westus'

// Dev's vault already exists with policies this template does not know
// about (a human user + another application) - see main.bicep header on
// why deployKeyVault must stay false here.
param deployKeyVault = false
param existingKeyVaultName = 'KV-ENMAXCOR-UW2-INV2SP-T'
param keyVaultDeployerObjectIds = [] // unused - deployKeyVault is false
param enablePurgeProtection = false // unused - deployKeyVault is false
param createPlaceholderSecret = false // unused - deployKeyVault is false; the existing secret is never touched by this template

// Hardening stays off in dev by design (ADR-0014) - not a permission gap,
// a deliberate choice so the working dev environment is not disturbed.
param enableHardening = false
param allowedIpRanges = [] // unused while enableHardening is false

param planSkuName = 'WS1'
param planCapacity = 1

// Manually configured, not managed here - see logicApp.bicep header.
param virtualNetworkSubnetId = ''

// Dev's 4 existing private endpoints are adopted as-is and never touched.
param deployPrivateEndpoints = false
param privateEndpointSubnetId = '' // unused
param privateDnsZoneIds = {
  blob: ''
  file: ''
  queue: ''
  table: ''
}

// Adopts the existing portal-created connection - name matches the live
// resource exactly (RG-ENMAX-COR-UW2-INV2SP-T/filesystem-2).
param fileSystemConnectionMode = 'adopt'
param fileSystemConnectionName = 'filesystem-2'
param dataGatewayResourceId = '' // unused - adopt mode
param fileShareRootFolder = '' // unused - adopt mode
param fileShareUsername = '' // unused - adopt mode
param fileSharePassword = '' // unused - adopt mode

// Changed to \\dcna30v004\AP_Invoice_LogicApp_Integration\LogicAppTest
// (decision, 2026-08-10 - user request, replaces the earlier "testing
// folder" value confirmed 2026-08-01). That earlier value itself
// corrected a LIVE dev misconfiguration (was previously "APInvoices",
// the PRODUCTION folder name, against the dev share root where that
// path does not exist - likely root cause of prior connectivity
// troubleshooting).
param fileShareTriggerFolder = 'LogicAppTest'

// Recreated fresh as V2 (decision reversed 2026-08-03 - see
// sharePointOnline.bicep module header). The prior "adopt" mode adopted an
// existing V1-kind connection that cannot support the accessPolicy grant
// the Standard Logic App's managed identity needs at runtime
// (ManagedServiceIdentity auth in connections.json requires V2). User
// approved deleting the V1 connection and recreating it as V2, accepting a
// one-time re-authorization step in the portal post-deploy.
param sharePointConnectionMode = 'create'
param sharePointConnectionName = 'sharepointonline'

// Corrects the LIVE dev misconfiguration (was pointed at the retired
// /sites/POCAP site).
param sharePointSiteUrl = 'https://enmaxcorp.sharepoint.com/sites/AP'
param sharePointLibraryName = 'Documents'
param sharePointContentType = 'Enmax Document'
param sharePointContentTypeId = '0x010100C5939496BD3E0F4287FA702FBCF7C0BE'
param sharePointTargetFolder = '/Shared Documents'

param office365ConnectionName = 'office365'

// Left empty deliberately - never commit real distribution-list addresses
// to source control. scripts/Deploy-All.ps1 reads the alertEmailTo Key
// Vault secret at deploy time and passes the resolved list to this
// parameter set at the CLI layer, overriding this empty default.
param alertRecipients = []

param maxAttempts = 3
param alertCooldownMinutes = 60
param digestScheduleTime = '07:00'
param digestTimeZone = 'America/Edmonton'
param deadmanThresholdHours = 6

// Kill-switch gates (decision, 2026-08-03 - PLAN.md section 17.7/17
// addendum): stay false until Invoke-OnDemandRun.ps1 has validated the
// engine end-to-end and both office365/sharepointonline connections are
// authorized. Flip via
//   az functionapp config appsettings set --settings SCHEDULED_TRIGGER_ENABLED=true
// (or the corresponding Enable-Triggers.ps1 call) - not by editing this
// file and redeploying, which would be a much slower/heavier path for
// what should be a fast, low-ceremony go-live toggle.
param scheduledTriggerEnabled = false

// Digest email footer escalation contact (decision, 2026-08-10 - user
// provided). Ticket-based escalation, not a distribution list.
param supportContactEmail = 'servicedesk@enmax.com'
param supportContactSubject = 'AP Invoices to SharePoint Integration Services'
