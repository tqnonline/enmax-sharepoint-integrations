import type { AppConfig } from "./AppConfigSchema";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../features/reserve/terminology";

type CheckoutConfigKey =
  | "EnableDrawingCheckout"
  | "EnableDrawingCheckIn"
  | "EnableDrawingDocumentCheckout"
  | "EnableDrawingDocumentCheckIn"
  | "EnableProcedureCheckout"
  | "EnableProcedureCheckIn"
  | "EnableStandardCheckout"
  | "EnableStandardCheckIn"
  | "EnableFormCheckout"
  | "EnableFormCheckIn";

function resolveCheckoutKey(
  reservationType?: number | null,
  documentSubtype?: number | null,
): Extract<CheckoutConfigKey, `Enable${string}Checkout`> | null {
  if (reservationType === RESERVATION_TYPE_VALUE.Document) {
    // Dual-read: pre-Heather Document Standard=1 / Procedure=2 (unambiguous under type Document).
    if (documentSubtype === 1 || documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard) {
      return "EnableStandardCheckout";
    }
    if (documentSubtype === 2 || documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure) {
      return "EnableProcedureCheckout";
    }
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form) return "EnableFormCheckout";
    // Unrecognized Document subtype — never fall through to Drawing (would ignore Form/Procedure flags).
    return null;
  }
  if (
    reservationType === RESERVATION_TYPE_VALUE.Drawing
    && documentSubtype === DOCUMENT_SUBTYPE_VALUE.DrawingDocument
  ) {
    return "EnableDrawingDocumentCheckout";
  }
  // Legacy rows with null type behave as Drawing (ADR 0001).
  return "EnableDrawingCheckout";
}

function resolveCheckInKey(
  reservationType?: number | null,
  documentSubtype?: number | null,
): Extract<CheckoutConfigKey, `Enable${string}CheckIn`> {
  if (reservationType === RESERVATION_TYPE_VALUE.Document) {
    if (documentSubtype === 1 || documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard) {
      return "EnableStandardCheckIn";
    }
    if (documentSubtype === 2 || documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure) {
      return "EnableProcedureCheckIn";
    }
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form) return "EnableFormCheckIn";
  }
  if (
    reservationType === RESERVATION_TYPE_VALUE.Drawing
    && documentSubtype === DOCUMENT_SUBTYPE_VALUE.DrawingDocument
  ) {
    return "EnableDrawingDocumentCheckIn";
  }
  return "EnableDrawingCheckIn";
}

/**
 * Whether Check Out is enabled for the given WS1a taxonomy.
 * Unrecognized Document subtypes return false — never fall through to the Drawing flag
 * (that would show Request Check Out when Form/Procedure checkout is disabled).
 */
export function isCheckoutEnabledForTaxonomy(
  config: AppConfig,
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  const key = resolveCheckoutKey(reservationType, documentSubtype);
  if (key == null) return false;
  return config[key];
}

/** Whether Check In is enabled for the given WS1a taxonomy (defaults true when absent). */
export function isCheckInEnabledForTaxonomy(
  config: AppConfig,
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  return config[resolveCheckInKey(reservationType, documentSubtype)];
}
