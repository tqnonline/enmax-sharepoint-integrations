import { describe, expect, it } from "vitest";
import {
  effectiveTypeFilter,
  reservationMatchesTypeFilter,
  taxonomyFilterClause,
  typeFilterClause,
} from "../../features/reserve/taxonomyFilters";
import { DOCUMENT_SUBTYPE_VALUE, RESERVATION_TYPE_VALUE } from "../../features/reserve/terminology";

describe("reservationMatchesTypeFilter", () => {
  it("treats null reservation type as Drawing", () => {
    expect(reservationMatchesTypeFilter("drawing", null, null)).toBe(true);
    expect(reservationMatchesTypeFilter("drawing", undefined, undefined)).toBe(true);
  });

  it("matches drawing and document filters", () => {
    expect(reservationMatchesTypeFilter("drawing", RESERVATION_TYPE_VALUE.Drawing, null)).toBe(true);
    expect(
      reservationMatchesTypeFilter(
        "documents",
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Standard,
      ),
    ).toBe(true);
    expect(
      reservationMatchesTypeFilter(
        "standard",
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Standard,
      ),
    ).toBe(true);
    expect(
      reservationMatchesTypeFilter(
        "procedure",
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Procedure,
      ),
    ).toBe(true);
    expect(
      reservationMatchesTypeFilter(
        "form",
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Form,
      ),
    ).toBe(true);
    expect(
      reservationMatchesTypeFilter(
        "documents",
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Form,
      ),
    ).toBe(true);
  });

  it("excludes mismatched taxonomy", () => {
    expect(
      reservationMatchesTypeFilter(
        "drawing",
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Standard,
      ),
    ).toBe(false);
    expect(
      reservationMatchesTypeFilter(
        "standard",
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Procedure,
      ),
    ).toBe(false);
    expect(
      reservationMatchesTypeFilter(
        "procedure",
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Form,
      ),
    ).toBe(false);
  });
});

describe("effectiveTypeFilter", () => {
  it("returns drawing for the drawing tab regardless of the subtype dropdown", () => {
    expect(effectiveTypeFilter("drawing", "standard")).toBe("drawing");
    expect(effectiveTypeFilter("drawing", "all")).toBe("drawing");
  });

  it("maps the documents tab subtype dropdown to its specific filter", () => {
    expect(effectiveTypeFilter("documents", "standard")).toBe("standard");
    expect(effectiveTypeFilter("documents", "procedure")).toBe("procedure");
    expect(effectiveTypeFilter("documents", "form")).toBe("form");
    expect(effectiveTypeFilter("documents", "all")).toBe("documents");
  });
});

describe("taxonomyFilterClause", () => {
  it("builds a Document/subtype clause for each document subtype", () => {
    expect(taxonomyFilterClause("Document", "Standard")).toContain(`enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Standard}`);
    expect(taxonomyFilterClause("Document", "Procedure")).toContain(`enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Procedure}`);
    expect(taxonomyFilterClause("Document", "Form")).toContain(`enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Form}`);
  });

  it("falls back to the Drawing/legacy-null clause for Drawing and undefined subtypes", () => {
    expect(taxonomyFilterClause("Drawing", undefined)).toBe(
      `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Drawing} or enmax_acdnreservationtype eq null)`,
    );
    expect(taxonomyFilterClause("Document", undefined)).toBe(
      `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Drawing} or enmax_acdnreservationtype eq null)`,
    );
  });
});

describe("typeFilterClause", () => {
  it("builds the merged documents clause and each specific subtype clause", () => {
    expect(typeFilterClause("documents")).toBe(
      `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Document} and (enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Standard} or enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Procedure} or enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Form}))`,
    );
    expect(typeFilterClause("standard")).toContain(`enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Standard}`);
    expect(typeFilterClause("procedure")).toContain(`enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Procedure}`);
    expect(typeFilterClause("form")).toContain(`enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Form}`);
  });

  it("builds the drawing/legacy-null clause for the drawing filter", () => {
    expect(typeFilterClause("drawing")).toBe(
      `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Drawing} or enmax_acdnreservationtype eq null)`,
    );
  });
});
