import type { AppConfig } from "./AppConfigSchema";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../features/reserve/terminology";

type CheckoutConfigKey =
  | "EnableDrawingCheckout"
  | "EnableDrawingCheckIn"
  | "EnableProcedureCheckout"
  | "EnableProcedureCheckIn"
  | "EnableStandardCheckout"
  | "EnableStandardCheckIn"
  | "EnableFormCheckout"
  | "EnableFormCheckIn";

function resolveCheckoutKey(
  reservationType?: number | null,
  documentSubtype?: number | null,
): Extract<CheckoutConfigKey, `Enable${string}Checkout`> {
  if (reservationType === RESERVATION_TYPE_VALUE.Document) {
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard) return "EnableStandardCheckout";
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure) return "EnableProcedureCheckout";
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form) return "EnableFormCheckout";
  }
  // Legacy rows with null type behave as Drawing (ADR 0001).
  return "EnableDrawingCheckout";
}

function resolveCheckInKey(
  reservationType?: number | null,
  documentSubtype?: number | null,
): Extract<CheckoutConfigKey, `Enable${string}CheckIn`> {
  if (reservationType === RESERVATION_TYPE_VALUE.Document) {
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard) return "EnableStandardCheckIn";
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure) return "EnableProcedureCheckIn";
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form) return "EnableFormCheckIn";
  }
  return "EnableDrawingCheckIn";
}

/** Whether Check Out is enabled for the given WS1a taxonomy (defaults true when absent). */
export function isCheckoutEnabledForTaxonomy(
  config: AppConfig,
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  return config[resolveCheckoutKey(reservationType, documentSubtype)];
}

/** Whether Check In is enabled for the given WS1a taxonomy (defaults true when absent). */
export function isCheckInEnabledForTaxonomy(
  config: AppConfig,
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  return config[resolveCheckInKey(reservationType, documentSubtype)];
}
