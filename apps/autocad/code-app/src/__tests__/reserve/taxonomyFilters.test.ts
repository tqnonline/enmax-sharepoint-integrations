import { describe, expect, it } from "vitest";
import { reservationMatchesTypeFilter } from "../../features/reserve/taxonomyFilters";
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
