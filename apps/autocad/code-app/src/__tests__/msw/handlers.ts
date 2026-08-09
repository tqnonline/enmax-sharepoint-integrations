import { http, HttpResponse } from "msw";
import type { AppConfig } from "../../config/AppConfigSchema";

export const VALID_CONFIG: AppConfig = {
  SingleAdminMode: false,
  MaxRecordsPerReservation: 10,
  MaxSheetsPerDrawing: 50,
  DefaultSheetsPerDrawing: 5,
  StaleCheckoutMonths: "3,6,12",
  AdminTeamId:    "7e7f5cf0-2153-f111-bec7-00224802e55b",
  ApproverTeamId: "00000000-0000-f000-0000-000000000002",
  UserTeamId:     "7de104bc-2153-f111-bec7-00224802e55b",
  SharedMailboxAddress: "noreply-autocad@tqnonline.onmicrosoft.com",
  SharePointSiteUrl: "https://example.sharepoint.com/sites/AutoCAD",
  BusinessUnitName: "ENMAX",
  BrandPrimary: "#E1393E",
  BrandSecondary: "#0F487A",
  BrandAccent: "#F7DB9C",
  DefaultTheme: "system",
  EnableTelemetry: false,
  MaintenanceBannerTitle: "Maintenance",
  MaintenanceBannerBody: "System is under maintenance",
  MaintenanceBannerSeverity: "Info",
  FooterDisclaimer: "For internal use only",
  FooterCopyright: "© 2026 ENMAX Corporation",
  BroadcastFanOutCadenceMinutes: 60,
  GridPageSize: 10,
  GridDefaultFromDays: 30,
  EnableDrawingCheckout: true,
  EnableDrawingCheckIn: true,
  EnableProcedureCheckout: true,
  EnableProcedureCheckIn: true,
  EnableStandardCheckout: true,
  EnableStandardCheckIn: true,
};

function configToRows(cfg: AppConfig) {
  return Object.entries(cfg).map(([key, val]) => ({
    enmax_acdnkey: key,
    enmax_acdnvalue: String(val),
    enmax_acdnvaluetype: typeof val === "boolean" ? 1 : typeof val === "number" ? 2 : 3,
  }));
}

export const handlers = [
  http.get("*/api/data/v9.2/enmax_autocadappconfigs", () =>
    HttpResponse.json({ value: configToRows(VALID_CONFIG) }),
  ),
  http.get("*/api/data/v9.2/WhoAmI", () =>
    HttpResponse.json({ UserId: "test-user-guid-00000001" }),
  ),
];
