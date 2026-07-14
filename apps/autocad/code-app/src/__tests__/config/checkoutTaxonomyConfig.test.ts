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
});
