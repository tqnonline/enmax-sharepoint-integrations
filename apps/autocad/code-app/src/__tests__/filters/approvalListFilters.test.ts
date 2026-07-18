import { describe, it, expect } from "vitest";
import {
  applyCheckinApprovalFilters,
  applyReservationApprovalFilters,
  defaultApprovalListFilters,
} from "../../features/approvals/approvalListFilters";
import type { CheckinRow } from "../../features/approvals/hooks/useCheckins";
import type { PendingReservation } from "../../features/approvals/hooks/usePendingReservations";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";

const FIXED_NOW = new Date("2026-07-09T12:00:00.000Z");
const DEFAULT = defaultGridDateRange(FIXED_NOW);

const reservation: PendingReservation = {
  enmax_acdnreservationid: "res-1",
  enmax_acdnreservationnumber: "RES-00001",
  _createdby_value: "user-a",
  _createdby_value_Formatted: "Alice",
  createdByJobTitle: "",
  enmax_acdndrawingcount: 1,
  enmax_acdnoverride: false,
  enmax_acdnreason: "Need numbers",
  enmax_acdnstatus: 1,
  createdon: "2026-06-15T10:00:00Z",
  submittedById: "user-a",
  submittedByName: "Alice",
  approvedById: "user-b",
  approvedByName: "Bob",
  businessCode: "GG",
  assetCode: "CG",
  unitCode: "00",
  domainCode: "ECS",
  systemCode: "AST",
  kindCode: "DD",
};

const checkin: CheckinRow = {
  checkoutId: "co-1",
  batchId: "batch-1",
  drawingId: "drw-1",
  sheetId: "sheet-1",
  drawingNumber: "GG-CG-00-ECS-AST-DD-0001",
  documentDisplayNumber: "GG-CG-00-ECS-AST-DD-0001-001",
  typeLabel: "Drawing",
  businessDisplay: "GG",
  assetDisplay: "CG",
  unitDisplay: "00",
  domainDisplay: "ECS",
  systemDisplay: "AST",
  kindDisplay: "DD",
  submittedById: "user-a",
  submittedByName: "Alice",
  approvedById: "",
  approvedByName: "",
  submittedOn: "2026-06-18T10:00:00Z",
  status: 6,
  statusLabel: "Requested",
  currentRevision: "A",
  submissionInfo: "",
  newPdfUrls: "",
  missingSheets: "",
  spLibraryUrl: "",
  sharePointUrl: "",
};

describe("approval list filters", () => {
  it("default 30-day range includes rows inside the window", () => {
    const rows = applyReservationApprovalFilters(
      [reservation],
      { number: "", from: DEFAULT.from, to: DEFAULT.to, peopleIds: [] },
    );
    expect(rows).toHaveLength(1);
  });

  it("excludes rows outside the default date window", () => {
    const rows = applyReservationApprovalFilters(
      [reservation],
      { number: "", from: "2026-07-01", to: "2026-07-05", peopleIds: [] },
    );
    expect(rows).toHaveLength(0);
  });

  it("number filter matches drawing/document coding sequence", () => {
    const all = applyReservationApprovalFilters(
      [reservation],
      { number: "", from: "", to: "", peopleIds: [] },
    );
    const match = applyReservationApprovalFilters(
      [reservation],
      { number: "GG-CG-00-ECS-AST-DD", from: "", to: "", peopleIds: [] },
    );
    const miss = applyReservationApprovalFilters(
      [reservation],
      { number: "ZZ-99-99-XXX-YYY-ZZ", from: "", to: "", peopleIds: [] },
    );
    expect(all).toHaveLength(1);
    expect(match).toHaveLength(1);
    expect(miss).toHaveLength(0);
  });

  it("people filter matches submitted by only, not approver", () => {
    const bySubmitter = applyReservationApprovalFilters(
      [reservation],
      { number: "", from: "", to: "", peopleIds: ["user-a"] },
    );
    const byApprover = applyReservationApprovalFilters(
      [reservation],
      { number: "", from: "", to: "", peopleIds: ["user-b"] },
    );
    const none = applyReservationApprovalFilters(
      [reservation],
      { number: "", from: "", to: "", peopleIds: ["other"] },
    );
    expect(bySubmitter).toHaveLength(1);
    expect(byApprover).toHaveLength(0);
    expect(none).toHaveLength(0);
  });

  it("check-in approvals use submittedOn for date filtering", () => {
    const inside = applyCheckinApprovalFilters(
      [checkin],
      { number: "", from: DEFAULT.from, to: DEFAULT.to, peopleIds: [] },
    );
    const outside = applyCheckinApprovalFilters(
      [checkin],
      { number: "", from: "2026-05-01", to: "2026-05-31", peopleIds: [] },
    );
    expect(inside).toHaveLength(1);
    expect(outside).toHaveLength(0);
  });

  it("every section defaults to the 30-day window", () => {
    for (const section of ["reservations", "documents"] as const) {
      const filters = defaultApprovalListFilters(section, FIXED_NOW);
      expect(filters.from).toBe(DEFAULT.from);
      expect(filters.to).toBe(DEFAULT.to);
    }
  });
});
