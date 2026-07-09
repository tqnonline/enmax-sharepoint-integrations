import { describe, it, expect } from "vitest";
import type { MyRecordRow } from "../../features/myitems/useMyRecords";
import { applyMyRecordListFilters } from "../../features/myitems/myItemListFilters";
import { DOCUMENT_SUBTYPE_VALUE } from "../../features/reserve/terminology";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";

const baseRow: MyRecordRow = {
  id: "1",
  number: "GG-CG-00-ECS-AST-DD-0001",
  title: "Test",
  typeLabel: "Standard Document",
  statusLabel: "Available",
  state: 2,
  createdOn: "2026-06-01T10:00:00Z",
  approvedOn: "",
  submittedById: "",
  submittedByName: "",
  approvedById: "",
  approvedByName: "",
  checkedOutOn: "",
  checkedInOn: "",
  revisionDate: "2026-06-15T10:00:00Z",
  libraryUrl: "",
  destinationUrl: "",
  source: "record",
  businessDisplay: "",
  assetDisplay: "",
  unitDisplay: "",
  domainDisplay: "",
  systemDisplay: "",
  kindDisplay: "",
  enmax_acdndocumentsubtype: DOCUMENT_SUBTYPE_VALUE.Standard,
};

describe("applyMyRecordListFilters", () => {
  it("default 30-day range includes rows inside the window", () => {
    const row = { ...baseRow, checkedInOn: "2026-06-15T10:00:00Z" };
    const { from, to } = defaultGridDateRange(new Date("2026-07-09T12:00:00.000Z"));
    const rows = applyMyRecordListFilters(
      [row],
      { number: "", from, to, documentSubtype: "all", peopleIds: [] },
      "available",
      (r) => r.number,
    );
    expect(rows).toHaveLength(1);
  });

  it("filters by date range on last check-in for available tab", () => {
    const row = { ...baseRow, checkedInOn: "2026-06-15T10:00:00Z" };
    const rows = applyMyRecordListFilters(
      [row],
      { number: "", from: "2026-06-10", to: "2026-06-20", documentSubtype: "all", peopleIds: [] },
      "available",
      (r) => r.number,
    );
    expect(rows).toHaveLength(1);
  });

  it("filters by document subtype", () => {
    const rows = applyMyRecordListFilters(
      [baseRow],
      { number: "", from: "", to: "", documentSubtype: "procedure", peopleIds: [] },
      "available",
      (r) => r.number,
    );
    expect(rows).toHaveLength(0);
  });

  it("includes old available sheets when date range is unset", () => {
    const oldRow = {
      ...baseRow,
      createdOn: "2025-01-01T10:00:00Z",
      revisionDate: "2025-06-01T10:00:00Z",
      checkedInOn: "",
    };
    const rows = applyMyRecordListFilters(
      [oldRow],
      { number: "", from: "", to: "", documentSubtype: "all", peopleIds: [] },
      "available",
      (r) => r.number,
    );
    expect(rows).toHaveLength(1);
  });

  it("filters by person id on submitter or approver columns", () => {
    const rows = applyMyRecordListFilters(
      [{ ...baseRow, submittedById: "user-a", approvedById: "" }],
      { number: "", from: "", to: "", documentSubtype: "all", peopleIds: ["user-a"] },
      "available",
      (r) => r.number,
    );
    expect(rows).toHaveLength(1);

    const none = applyMyRecordListFilters(
      [baseRow],
      { number: "", from: "", to: "", documentSubtype: "all", peopleIds: ["other-user"] },
      "available",
      (r) => r.number,
    );
    expect(none).toHaveLength(0);
  });
});
