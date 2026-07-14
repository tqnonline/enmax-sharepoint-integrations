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
  // WS5 two-site SharePoint topology: four library base URLs (Drawings + Documents,
  // each drop-off + destination). Optional so environments without them configured
  // fall back gracefully; the indexer flow and upload surface read these.
  DrawingsDropOffLibraryUrl:      z.url().optional(),
  DrawingsDestinationLibraryUrl:  z.url().optional(),
  DocumentsDropOffLibraryUrl:     z.url().optional(),
  DocumentsDestinationLibraryUrl: z.url().optional(),
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
  EnableProcedureCheckout:        z.boolean().default(true),
  EnableProcedureCheckIn:         z.boolean().default(true),
  EnableStandardCheckout:         z.boolean().default(true),
  EnableStandardCheckIn:          z.boolean().default(true),
  EnableFormCheckout:             z.boolean().default(true),
  EnableFormCheckIn:              z.boolean().default(true),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
