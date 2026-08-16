import type { ReserveForm } from "./schema";

/**
 * Maps the simplified Reserve wizard quantities onto WS1a taxonomy before create.
 *
 * Drawing (no Drawing-Type fork in the UI):
 *   sheets === 0 → Drawing Document (base / drawing docs only)
 *   sheets ≥ 1  → Drawing (docs + numbered sheet files)
 *
 * Procedure New may carry forms-per-procedure in sheetsPerDrawing (0 = procedures only).
 * Form alone stays Existing-only (no remap here).
 * Standard is unchanged.
 *
 * Requires Dataverse `enmax_acdnsheetsperdrawing` MinValue = 0 (Entity.xml / solution import).
 */
export function resolveReserveSubmitForm(form: ReserveForm): ReserveForm {
  if (form.reservationType === "Drawing") {
    const sheets = Number(form.sheetsPerDrawing);
    if (!Number.isFinite(sheets) || sheets <= 0) {
      return {
        ...form,
        documentSubtype: "DrawingDocument",
        sheetsPerDrawing: 0,
      };
    }
    return {
      ...form,
      documentSubtype: "Drawing",
      sheetsPerDrawing: Math.floor(sheets),
    };
  }
  return form;
}

/** Whether Details should show the child-quantity field (sheets / forms). */
export function showsReserveChildQuantity(
  reservationType: ReserveForm["reservationType"],
  documentSubtype: ReserveForm["documentSubtype"],
): boolean {
  if (reservationType === "Drawing") {
    // Unified Drawing path — sheets 0 vs ≥1 decides issuance subtype on submit.
    return documentSubtype === "Drawing" || documentSubtype === "DrawingDocument" || documentSubtype == null;
  }
  if (reservationType === "Document" && documentSubtype === "Procedure") return true;
  if (reservationType === "Document" && documentSubtype === "Form") return true;
  return false;
}
