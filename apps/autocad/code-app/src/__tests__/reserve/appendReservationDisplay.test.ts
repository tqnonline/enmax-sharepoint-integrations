import { describe, expect, it } from "vitest";
import { taxonomyFilterClause } from "../../features/reserve/taxonomyFilters";
import {
  formatAppendDisplay,
  formatReservationDisplay,
  reservationIssuanceComplete,
} from "../../features/approvals/compositionUtils";

describe("taxonomyFilterClause", () => {
  it("scopes Drawing search to drawing taxonomy", () => {
    expect(taxonomyFilterClause("Drawing")).toContain("enmax_acdnreservationtype eq 1");
  });

  it("scopes Procedure search to procedure taxonomy", () => {
    const clause = taxonomyFilterClause("Document", "Procedure");
    expect(clause).toContain("enmax_acdndocumentsubtype eq 2");
  });

  it("scopes Standard search to standard taxonomy", () => {
    const clause = taxonomyFilterClause("Document", "Standard");
    expect(clause).toContain("enmax_acdndocumentsubtype eq 1");
  });
});

describe("append reservation display", () => {
  it("treats append range as complete issuance", () => {
    expect(reservationIssuanceComplete({ appendFirst: 4, appendLast: 5 })).toBe(true);
  });

  it("shows base plus child suffix for approved append", () => {
    expect(
      formatReservationDisplay({
        sequenceType: 2,
        targetDrawingId: "d-1",
        targetDrawingNumber: "DE-9A-00-AES-AAA-AC-0009",
        appendFirst: 12,
        appendLast: 14,
      }),
    ).toBe("DE-9A-00-AES-AAA-AC-0009-012–014");
  });

  it("shows pending append target with placeholder suffix", () => {
    expect(
      formatAppendDisplay("DE-9A-00-AES-AAA-AC-0009", null, null),
    ).toBe("DE-9A-00-AES-AAA-AC-0009-???");
  });
});
