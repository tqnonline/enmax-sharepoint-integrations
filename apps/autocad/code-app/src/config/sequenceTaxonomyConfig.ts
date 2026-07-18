import type { AppConfig } from "./AppConfigSchema";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../features/reserve/terminology";

/**
 * Sequence gates for WS1a taxonomy (docs/drawing-document-subtype-CONTRACT.md
 * + apps/code-app/src/__tests__/taxonomy/taxonomyMatrix.ts).
 *
 * Drawing Document is New-only unless AllowDrawingDocumentExistingSequence.
 * Standard/Procedure are New-only. Form is Existing-only. Drawing allows both.
 */
export function isExistingSequenceAllowedForTaxonomy(
  config: AppConfig,
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  if (
    reservationType === RESERVATION_TYPE_VALUE.Drawing
    && documentSubtype === DOCUMENT_SUBTYPE_VALUE.DrawingDocument
  ) {
    return config.AllowDrawingDocumentExistingSequence;
  }
  if (reservationType === RESERVATION_TYPE_VALUE.Document) {
    if (
      documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard
      || documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure
    ) {
      return false;
    }
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form) return true;
  }
  // Drawing (numbered) + legacy null taxonomy: Existing allowed.
  return true;
}

/** Whether "Reserve new" is allowed (Form is Existing-only per contract). */
export function isNewSequenceAllowedForTaxonomy(
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  if (
    reservationType === RESERVATION_TYPE_VALUE.Document
    && documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form
  ) {
    return false;
  }
  return true;
}
