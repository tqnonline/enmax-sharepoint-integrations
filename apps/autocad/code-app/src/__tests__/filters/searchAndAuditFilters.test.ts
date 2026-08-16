import { describe, it, expect } from "vitest";
import { buildAuditFilter } from "../../features/audit/auditFilter";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";
import { mergeDocumentSearchParams } from "../../features/search/searchListFilters";
import type { GridFetchParams } from "../../components/DataGrid";

const FIXED_NOW = new Date("2026-07-09T12:00:00.000Z");
const DEFAULT = defaultGridDateRange(FIXED_NOW);

describe("audit OData filters", () => {
  it("always includes date bounds when from/to are set", () => {
    const filter = buildAuditFilter({
      dateFrom: DEFAULT.from,
      dateTo: DEFAULT.to,
      filterEvent: "",
      filterTable: "",
      filterSubjectId: "",
      filterSource: "",
      peopleIds: [],
    });
    expect(filter).toContain(`createdon ge ${DEFAULT.from}T00:00:00Z`);
    expect(filter).toContain(`createdon le ${DEFAULT.to}T23:59:59Z`);
  });

  it("optional event/table/subject/source filters are omitted when empty", () => {
    const filter = buildAuditFilter({
      dateFrom: DEFAULT.from,
      dateTo: DEFAULT.to,
      filterEvent: "",
      filterTable: "",
      filterSubjectId: "",
      filterSource: "",
      peopleIds: [],
    }) ?? "";
    expect(filter).not.toContain("enmax_acdnevent");
    expect(filter).not.toContain("enmax_acdnsubjecttable");
    expect(filter).not.toContain("enmax_acdnsubjectid");
    expect(filter).not.toContain("enmax_acdnsource");
    expect(filter).not.toContain("_enmax_acdnactedby_value");
  });

  it("adds only the optional clauses the user entered", () => {
    const filter = buildAuditFilter({
      dateFrom: "",
      dateTo: "",
      filterEvent: "3",
      filterTable: "enmax_autocaddrawing",
      filterSubjectId: "drw-1",
      filterSource: "1",
      peopleIds: ["user-1"],
    }) ?? "";
    expect(filter).toContain("enmax_acdnevent eq 3");
    expect(filter).toContain("enmax_acdnsubjecttable eq 'enmax_autocaddrawing'");
    expect(filter).toContain("enmax_acdnsubjectid eq 'drw-1'");
    expect(filter).toContain("enmax_acdnsource eq 1");
    expect(filter).toContain("_enmax_acdnactedby_value eq 'user-1'");
  });
});

describe("search OData merge", () => {
  const baseParams: GridFetchParams = {
    search: "",
    filters: {},
    sort: null,
    page: 0,
    pageSize: 50,
  };

  it("merges default date range into server params", () => {
    const merged = mergeDocumentSearchParams(
      "drawings",
      {
        number: "",
        from: DEFAULT.from,
        to: DEFAULT.to,
        documentSubtype: "all",
        peopleIds: [],
        composition: {
          businessId: "",
          assetId: "",
          unitId: "",
          domainId: "",
          systemId: "",
          kindId: "",
        },
      },
      baseParams,
    );
    expect(merged.filters.dateFrom).toBe(DEFAULT.from);
    expect(merged.filters.dateTo).toBe(DEFAULT.to);
    expect(merged.filters.peopleIds).toBeNull();
    expect(merged.filters.business).toBeNull();
  });

  it("merges only composition fields the user selected", () => {
    const merged = mergeDocumentSearchParams(
      "drawings",
      {
        number: "GG-CG",
        from: DEFAULT.from,
        to: DEFAULT.to,
        documentSubtype: "all",
        peopleIds: ["user-1"],
        composition: {
          businessId: "biz-1",
          assetId: "",
          unitId: "",
          domainId: "",
          systemId: "",
          kindId: "",
        },
      },
      baseParams,
    );
    expect(merged.search).toBe("GG-CG");
    expect(merged.filters.peopleIds).toEqual(["user-1"]);
    expect(merged.filters.business).toBe("biz-1");
    expect(merged.filters.asset).toBeNull();
    expect(merged.filters.documentSubtype).toBe("drawing");
  });
});
