import { describe, expect, test } from "vitest";
import {
  isExistingSequenceAllowedForTaxonomy,
  isNewSequenceAllowedForTaxonomy,
} from "../../config/sequenceTaxonomyConfig";
import type { AppConfig } from "../../config/AppConfigSchema";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../../features/reserve/terminology";

function config(overrides: Partial<AppConfig>): AppConfig {
  return {
    AllowDrawingDocumentExistingSequence: false,
    ...overrides,
  } as AppConfig;
}

describe("isExistingSequenceAllowedForTaxonomy", () => {
  test("Drawing Document is New-only by default (AllowDrawingDocumentExistingSequence=false)", () => {
    const cfg = config({});
    expect(
      isExistingSequenceAllowedForTaxonomy(
        cfg,
        RESERVATION_TYPE_VALUE.Drawing,
        DOCUMENT_SUBTYPE_VALUE.DrawingDocument,
      ),
    ).toBe(false);
  });

  test("Drawing Document allows Existing when the config override is true", () => {
    const cfg = config({ AllowDrawingDocumentExistingSequence: true });
    expect(
      isExistingSequenceAllowedForTaxonomy(
        cfg,
        RESERVATION_TYPE_VALUE.Drawing,
        DOCUMENT_SUBTYPE_VALUE.DrawingDocument,
      ),
    ).toBe(true);
  });

  test("plain Drawing allows Existing regardless of the Drawing Document flag", () => {
    const cfg = config({ AllowDrawingDocumentExistingSequence: false });
    expect(
      isExistingSequenceAllowedForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.Drawing),
    ).toBe(true);
  });

  test("Standard and Procedure are New-only (Existing disallowed)", () => {
    const cfg = config({});
    expect(
      isExistingSequenceAllowedForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard),
    ).toBe(false);
    expect(
      isExistingSequenceAllowedForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure),
    ).toBe(false);
  });

  test("Form allows Existing (Existing-only per contract)", () => {
    const cfg = config({});
    expect(
      isExistingSequenceAllowedForTaxonomy(cfg, RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form),
    ).toBe(true);
  });

  test("legacy null/undefined taxonomy is unrestricted", () => {
    const cfg = config({});
    expect(isExistingSequenceAllowedForTaxonomy(cfg, null, null)).toBe(true);
    expect(isExistingSequenceAllowedForTaxonomy(cfg, undefined, undefined)).toBe(true);
  });
});

describe("isNewSequenceAllowedForTaxonomy", () => {
  test("Form is Existing-only — New is disallowed", () => {
    expect(
      isNewSequenceAllowedForTaxonomy(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form),
    ).toBe(false);
  });

  test("Drawing Document / Drawing / Standard / Procedure allow New", () => {
    expect(
      isNewSequenceAllowedForTaxonomy(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.DrawingDocument),
    ).toBe(true);
    expect(
      isNewSequenceAllowedForTaxonomy(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.Drawing),
    ).toBe(true);
    expect(
      isNewSequenceAllowedForTaxonomy(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard),
    ).toBe(true);
    expect(
      isNewSequenceAllowedForTaxonomy(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure),
    ).toBe(true);
  });
});
