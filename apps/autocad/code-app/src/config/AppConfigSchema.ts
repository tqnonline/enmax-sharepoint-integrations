import { z } from "zod";

// Dataverse GUIDs don't conform to RFC 4122 version/variant nibble rules,
// so z.string().uuid() (Zod v4) rejects them. Use a looser GUID pattern.
const guidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Must be a valid GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
);

export const AppConfigSchema = z.object({
  SingleAdminMode:                z.boolean(),
  MaxRecordsPerReservation:       z.number().int().min(1),
  MaxSheetsPerDrawing:            z.number().int().min(1),
  DefaultSheetsPerDrawing:        z.number().int().min(1),
  StaleCheckoutMonths:            z.string().regex(/^(\d+,)*\d+$/),
  AdminTeamId:                    guidSchema.optional(),
  ApproverTeamId:                 guidSchema.optional(),
  UserTeamId:                     guidSchema.optional(),
  SharedMailboxAddress:           z.email(),
  DocControlEmailAddress:         z.email().optional(),
  CodeAppBaseUrl:                 z.url().optional(),
  SharePointSiteUrl:              z.url(),
  CheckInUploadLibraryUrl:        z.url().optional(),
  // Per-taxonomy SharePoint library URLs (drop-off + destination × 4 taxonomies).
  // Legacy Drawings*/Documents* keys remain optional for migration fallback.
  DrawingDropOffLibraryUrl:                 z.url().optional(),
  DrawingDestinationLibraryUrl:             z.url().optional(),
  DocumentDropOffLibraryUrl:                z.url().optional(),
  DocumentDestinationLibraryUrl:            z.url().optional(),
  // Legacy per-subtype fallbacks, kept optional for migration (docs/drawing-document-subtype-CONTRACT.md).
  StandardDocumentDropOffLibraryUrl:        z.url().optional(),
  StandardDocumentDestinationLibraryUrl:    z.url().optional(),
  ProcedureDocumentDropOffLibraryUrl:       z.url().optional(),
  ProcedureDocumentDestinationLibraryUrl:   z.url().optional(),
  FormDocumentDropOffLibraryUrl:            z.url().optional(),
  FormDocumentDestinationLibraryUrl:        z.url().optional(),
  DrawingsDropOffLibraryUrl:      z.url().optional(),
  DrawingsDestinationLibraryUrl:  z.url().optional(),
  DocumentsDropOffLibraryUrl:     z.url().optional(),
  DocumentsDestinationLibraryUrl: z.url().optional(),
  // Indexer-only kind CSVs (docs/drawing-document-subtype-CONTRACT.md).
  StandardDocumentKindCodes:      z.string().optional(),
  ProcedureDocumentKindCodes:     z.string().optional(),
  DrawingDocumentSPContentTypeName: z.string().optional(),
  DrawingDocumentSPContentTypeId:   z.string().optional(),
  SharePointIndexerLogFolderPath:   z.string().optional(),
  SharePointIndexerMaxCsvRows:      z.number().int().min(1).optional(),
  SharePointIndexerIncrementalHours: z.number().int().min(1).optional(),
  SharePointRecordTypeMap:          z.string().optional(),
  AppOwnerTeamId:                   guidSchema.optional(),
  BusinessUnitName:               z.string(),
  BrandPrimary:                   z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  BrandSecondary:                 z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  BrandAccent:                    z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  DefaultTheme:                   z.enum(["light", "dark", "system"]),
  EnableTelemetry:                z.boolean(),
  MaintenanceBannerTitle:         z.string(),
  MaintenanceBannerBody:          z.string(),
  MaintenanceBannerSeverity:      z.enum(["Info", "Warning", "Critical"]),
  FooterDisclaimer:               z.string(),
  FooterCopyright:                z.string(),
  BroadcastFanOutCadenceMinutes:  z.number().int().min(1),
  GridPageSize:                   z.number().int().min(1).default(10),
  // Inclusive lookback for grid From/To defaults (today − N days through today).
  GridDefaultFromDays:            z.number().int().min(1).default(30),
  // Check In is a gated approval step by default (mirrors RequireCheckOutApproval).
  // Seed an explicit false row to auto-close check-ins without approval.
  RequireCheckInApproval:         z.boolean().default(true),
  // WS3: Check Out is a gated/approved action. Mandatory per requirement #8, but
  // exposed as a toggle (mirrors RequireCheckInApproval) and defaults to enabled.
  RequireCheckOutApproval:        z.boolean().default(true),
  // WS4 item 14: Finalize and Mark Obsolete are hidden by default. Admins opt in
  // per environment by seeding these true; when the keys are absent they default
  // false so the actions stay hidden.
  ShowFinalizeButton:             z.boolean().default(false),
  ShowObsoleteButton:             z.boolean().default(false),
  // Per-taxonomy checkout/check-in toggles (ADR 0001). Absent rows default ON so
  // checkout flows stay enabled unless an admin explicitly disables a type.
  EnableDrawingCheckout:          z.boolean().default(true),
  EnableDrawingCheckIn:           z.boolean().default(true),
  EnableDrawingDocumentCheckout:  z.boolean().default(true),
  EnableDrawingDocumentCheckIn:   z.boolean().default(true),
  EnableProcedureCheckout:        z.boolean().default(true),
  EnableProcedureCheckIn:         z.boolean().default(true),
  EnableStandardCheckout:         z.boolean().default(true),
  EnableStandardCheckIn:          z.boolean().default(true),
  EnableFormCheckout:             z.boolean().default(true),
  EnableFormCheckIn:              z.boolean().default(true),
  // Drawing Document is New-only (docs/drawing-document-subtype-CONTRACT.md) —
  // Existing sequence append is disallowed regardless of admin overrides.
  AllowDrawingDocumentExistingSequence: z.boolean().default(false),
  // Header environment chip (Rule 15). "Production" / "Prod" / blank → hidden;
  // any other value (e.g. Sandbox, DEV, UAT) is shown uppercased. Defaults to
  // Production so a missing row never paints a sandbox badge on prod.
  EnvironmentBadge: z.string().default("Production"),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
