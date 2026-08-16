import { describe, it, expect, vi } from "vitest";
import type { MyRecordRow } from "../../features/myitems/useMyRecords";
import { applyMyRecordListFilters, defaultMyItemsListFilters } from "../../features/myitems/myItemListFilters";
import { DOCUMENT_SUBTYPE_VALUE } from "../../features/reserve/terminology";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";

const baseRow: MyRecordRow = {
  id: "1",
  number: "GG-CG-00-ECS-AST-DD-0001",
  title: "Test",
  typeLabel: "Standard",
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
  it("defaultMyItemsListFilters uses 30-day window on every tab", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    const expected = defaultGridDateRange(now);
    for (const state of ["reservations", "available", "pendingapproval", "checkedout"] as const) {
      expect(defaultMyItemsListFilters(state, now)).toMatchObject({
        from: expected.from,
        to: expected.to,
        number: "",
        documentSubtype: "all",
        peopleIds: [],
      });
    }
  });

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

  it("includes available rows when revision is recent but check-in is older", () => {
    const row = {
      ...baseRow,
      checkedInOn: "2025-01-01T10:00:00Z",
      revisionDate: "2026-06-20T10:00:00Z",
      createdOn: "2025-01-01T10:00:00Z",
    };
    const rows = applyMyRecordListFilters(
      [row],
      { number: "", from: "2026-06-10", to: "2026-06-30", documentSubtype: "all", peopleIds: [] },
      "available",
      (r) => r.number,
    );
    expect(rows).toHaveLength(1);
  });

  it("repairs inverted date ranges to the 30-day default window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00"));
    try {
      // Inside last-30-days of frozen "today" (2026-07-10 … 2026-08-09).
      const row = {
        ...baseRow,
        revisionDate: "2026-07-20T10:00:00Z",
        createdOn: "2026-07-20T10:00:00Z",
      };
      const rows = applyMyRecordListFilters(
        [row],
        { number: "", from: "2026-08-10", to: "2026-07-10", documentSubtype: "all", peopleIds: [] },
        "available",
        (r) => r.number,
      );
      expect(rows).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters by document subtype", () => {
    const rows = applyMyRecordListFilters(
      [baseRow],
      { number: "", from: "2020-01-01", to: "2030-12-31", documentSubtype: "procedure", peopleIds: [] },
      "available",
      (r) => r.number,
    );
    expect(rows).toHaveLength(0);
  });

  it("excludes available sheets outside the default 30-day activity window", () => {
    const oldRow = {
      ...baseRow,
      createdOn: "2025-01-01T10:00:00Z",
      revisionDate: "2025-06-01T10:00:00Z",
      checkedInOn: "",
    };
    const { from, to } = defaultGridDateRange(new Date("2026-07-09T12:00:00.000Z"));
    const rows = applyMyRecordListFilters(
      [oldRow],
      { number: "", from, to, documentSubtype: "all", peopleIds: [] },
      "available",
      (r) => r.number,
    );
    expect(rows).toHaveLength(0);
  });

  it("filters by person id on submitter or approver columns", () => {
    const wide = { number: "", from: "2020-01-01", to: "2030-12-31", documentSubtype: "all" as const, peopleIds: ["user-a"] };
    const rows = applyMyRecordListFilters(
      [{ ...baseRow, submittedById: "user-a", approvedById: "" }],
      wide,
      "available",
      (r) => r.number,
    );
    expect(rows).toHaveLength(1);

    const none = applyMyRecordListFilters(
      [baseRow],
      { ...wide, peopleIds: ["other-user"] },
      "available",
      (r) => r.number,
    );
    expect(none).toHaveLength(0);
  });
});
