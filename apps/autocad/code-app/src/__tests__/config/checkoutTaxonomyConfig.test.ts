import { describe, expect, test } from "vitest";
import {
  isCheckInEnabledForTaxonomy,
  isCheckoutEnabledForTaxonomy,
} from "../../config/checkoutTaxonomyConfig";
import type { AppConfig } from "../../config/AppConfigSchema";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../../features/reserve/terminology";

function config(overrides: Partial<AppConfig>): AppConfig {
  return {
    EnableDrawingCheckout: true,
    EnableDrawingCheckIn: true,
    EnableDrawingDocumentCheckout: true,
    EnableDrawingDocumentCheckIn: true,
    EnableProcedureCheckout: true,
    EnableProcedureCheckIn: true,
    EnableStandardCheckout: true,
    EnableStandardCheckIn: true,
    EnableFormCheckout: true,
    EnableFormCheckIn: true,
    RequireCheckOutApproval: true,
    ...overrides,
  } as AppConfig;
}

describe("isCheckoutEnabledForTaxonomy", () => {
  test("uses drawing flag for drawing / legacy null type", () => {
    const cfg = config({ EnableDrawingCheckout: false });
    expect(isCheckoutEnabledForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Drawing, null)).toBe(false);
    expect(isCheckoutEnabledForTaxonomy(cfg, null, null)).toBe(false);
  });

  test("uses standard / procedure / form flags for documents", () => {
    const cfg = config({
      EnableStandardCheckout: false,
      EnableProcedureCheckout: true,
      EnableFormCheckout: false,
    });
    expect(
      isCheckoutEnabledForTaxonomy(
        cfg,
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Standard,
      ),
    ).toBe(false);
    expect(
      isCheckoutEnabledForTaxonomy(
        cfg,
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Procedure,
      ),
    ).toBe(true);
    expect(
      isCheckoutEnabledForTaxonomy(
        cfg,
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Form,
      ),
    ).toBe(false);
  });

  test("Document with unrecognized subtype does not inherit Drawing checkout", () => {
    const cfg = config({ EnableDrawingCheckout: true, EnableFormCheckout: false });
    expect(
      isCheckoutEnabledForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Document, 99),
    ).toBe(false);
  });

  test("uses the Drawing Document flag only when type is Drawing (not Document+1 cutover)", () => {
    const cfg = config({
      EnableDrawingCheckout: true,
      EnableDrawingDocumentCheckout: false,
      EnableStandardCheckout: false,
    });
    expect(
      isCheckoutEnabledForTaxonomy(
        cfg,
        RESERVATION_TYPE_VALUE.Drawing,
        DOCUMENT_SUBTYPE_VALUE.DrawingDocument,
      ),
    ).toBe(false);
    expect(
      isCheckoutEnabledForTaxonomy(
        cfg,
        RESERVATION_TYPE_VALUE.Drawing,
        DOCUMENT_SUBTYPE_VALUE.Drawing,
      ),
    ).toBe(true);
    // Pre-Heather Document+Standard(1) must not hit Drawing Document keys.
    expect(
      isCheckoutEnabledForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Document, 1),
    ).toBe(false);
  });
});

describe("isCheckInEnabledForTaxonomy", () => {
  test("gates check-in independently of checkout", () => {
    const cfg = config({
      EnableDrawingCheckout: true,
      EnableDrawingCheckIn: false,
    });
    expect(isCheckInEnabledForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Drawing, null)).toBe(false);
    expect(isCheckoutEnabledForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Drawing, null)).toBe(true);
  });

  test("uses the Drawing Document check-in flag", () => {
    const cfg = config({ EnableDrawingDocumentCheckIn: false });
    expect(
      isCheckInEnabledForTaxonomy(
        cfg,
        RESERVATION_TYPE_VALUE.Drawing,
        DOCUMENT_SUBTYPE_VALUE.DrawingDocument,
      ),
    ).toBe(false);
  });

  test("uses standard / procedure / form check-in flags for documents", () => {
    const cfg = config({
      EnableStandardCheckIn: false,
      EnableProcedureCheckIn: true,
      EnableFormCheckIn: false,
    });
    expect(
      isCheckInEnabledForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard),
    ).toBe(false);
    expect(
      isCheckInEnabledForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure),
    ).toBe(true);
    expect(
      isCheckInEnabledForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form),
    ).toBe(false);
  });
});
