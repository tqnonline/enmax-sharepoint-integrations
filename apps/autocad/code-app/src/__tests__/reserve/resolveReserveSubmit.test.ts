import { describe, expect, it } from "vitest";
import {
  resolveReserveSubmitForm,
  showsReserveChildQuantity,
} from "../../features/reserve/resolveReserveSubmit";
import type { ReserveForm } from "../../features/reserve/schema";

const base: ReserveForm = {
  reservationType: "Drawing",
  documentSubtype: "Drawing",
  business: "b",
  asset: "a",
  unit: "u",
  domain: "d",
  system: "s",
  kind: "k",
  count: 2,
  sheetsPerDrawing: 5,
  sequenceType: "New",
  reason: "enough characters for reason",
};

describe("resolveReserveSubmitForm", () => {
  it("maps Drawing + sheets 0 to Drawing Document", () => {
    const resolved = resolveReserveSubmitForm({ ...base, sheetsPerDrawing: 0 });
    expect(resolved.documentSubtype).toBe("DrawingDocument");
    expect(resolved.sheetsPerDrawing).toBe(0);
  });

  it("keeps Drawing subtype when sheets ≥ 1", () => {
    const resolved = resolveReserveSubmitForm({ ...base, sheetsPerDrawing: 3 });
    expect(resolved.documentSubtype).toBe("Drawing");
    expect(resolved.sheetsPerDrawing).toBe(3);
  });

  it("leaves Standard / Procedure / Form subtypes unchanged", () => {
    expect(
      resolveReserveSubmitForm({
        ...base,
        reservationType: "Document",
        documentSubtype: "Procedure",
        sheetsPerDrawing: 2,
      }).documentSubtype,
    ).toBe("Procedure");
    expect(
      resolveReserveSubmitForm({
        ...base,
        reservationType: "Document",
        documentSubtype: "Standard",
        sheetsPerDrawing: 1,
      }).documentSubtype,
    ).toBe("Standard");
  });
});

describe("showsReserveChildQuantity", () => {
  it("shows sheets for unified Drawing path and Procedure/Form", () => {
    expect(showsReserveChildQuantity("Drawing", "Drawing")).toBe(true);
    expect(showsReserveChildQuantity("Document", "Procedure")).toBe(true);
    expect(showsReserveChildQuantity("Document", "Form")).toBe(true);
    expect(showsReserveChildQuantity("Document", "Standard")).toBe(false);
  });
});
