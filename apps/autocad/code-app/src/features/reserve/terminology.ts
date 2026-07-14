import type { ReserveForm } from "./schema";
import {
  individualItemLabel,
  individualItemLabelPlural,
  taxonomyTypeLabel,
} from "./numberingTerms";

// Dataverse option values for the WS1a taxonomy columns.
export const RESERVATION_TYPE_VALUE = { Drawing: 1, Document: 2 } as const;
export const DOCUMENT_SUBTYPE_VALUE = { Standard: 1, Procedure: 2, Form: 3 } as const;

export interface ReserveTerminology {
  /** Human label for the reservation type, e.g. "Drawing", "Standard Document". */
  typeLabel: string;
  /** Singular base noun, e.g. "drawing", "standard document", "procedure". */
  baseNoun: string;
  /** Plural base noun, e.g. "drawings". */
  baseNounPlural: string;
  /** Child item noun, or null when the type is base-only (Standard / Procedure). */
  childNoun: string | null;
  /** Whether this type produces child items (-sss). Standard and Procedure are base-only. */
  createsChildren: boolean;
}

/**
 * Type-aware terminology for the reserve wizard (ADR 0001, Heather numbering model).
 * - Drawing     → base Drawing Number + child Drawing documents (-SSS)
 * - Standard    → single Standard Document (no children)
 * - Procedure   → single Procedure (no children)
 * - Form        → Form Number range + child Forms (-SSS)
 */
export function reserveTerminology(
  reservationType: ReserveForm["reservationType"],
  documentSubtype: ReserveForm["documentSubtype"],
): ReserveTerminology {
  const type = reservationType === "Document"
    ? RESERVATION_TYPE_VALUE.Document
    : RESERVATION_TYPE_VALUE.Drawing;
  const subtype = documentSubtype === "Standard"
    ? DOCUMENT_SUBTYPE_VALUE.Standard
    : documentSubtype === "Procedure"
      ? DOCUMENT_SUBTYPE_VALUE.Procedure
      : documentSubtype === "Form"
        ? DOCUMENT_SUBTYPE_VALUE.Form
        : undefined;

  if (reservationType === "Document" && documentSubtype === "Standard") {
    return {
      typeLabel: taxonomyTypeLabel(type, subtype),
      baseNoun: "standard document",
      baseNounPlural: "standard documents",
      childNoun: null,
      createsChildren: false,
    };
  }
  if (reservationType === "Document" && documentSubtype === "Procedure") {
    return {
      typeLabel: taxonomyTypeLabel(type, subtype),
      baseNoun: "procedure",
      baseNounPlural: "procedures",
      childNoun: null,
      createsChildren: false,
    };
  }
  if (reservationType === "Document" && documentSubtype === "Form") {
    const child = individualItemLabel(type, subtype);
    return {
      typeLabel: taxonomyTypeLabel(type, subtype),
      baseNoun: "form",
      baseNounPlural: "forms",
      childNoun: child,
      createsChildren: true,
    };
  }
  const child = individualItemLabel(RESERVATION_TYPE_VALUE.Drawing, undefined);
  return {
    typeLabel: taxonomyTypeLabel(RESERVATION_TYPE_VALUE.Drawing, undefined),
    baseNoun: "drawing number",
    baseNounPlural: "drawing numbers",
    childNoun: child,
    createsChildren: true,
  };
}

export interface TaxonomyOptionValues {
  enmax_acdnreservationtype?: number | null;
  enmax_acdndocumentsubtype?: number | null;
}

/**
 * Type label for a drawing/document row. Uses denormalized fields on the drawing
 * when present; otherwise falls back to the parent reservation (taxonomy is not
 * always stamped on older or manually created drawings).
 */
export function drawingTypeDisplayLabel(
  drawing: TaxonomyOptionValues,
  reservation?: TaxonomyOptionValues | null,
): string {
  return reservationTypeDisplayLabel(
    drawing.enmax_acdnreservationtype ?? reservation?.enmax_acdnreservationtype,
    drawing.enmax_acdndocumentsubtype ?? reservation?.enmax_acdndocumentsubtype,
  );
}

/** Map WS6 Dataverse option values to a user-facing type label (lists + detail). */
export function reservationTypeDisplayLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  return taxonomyTypeLabel(reservationType, documentSubtype);
}

/**
 * Plural label for the base-record section on a reservation (the enmax_autocaddrawing
 * rows). Drawing -> "Drawings", Standard -> "Documents", Procedure -> "Procedures", Form -> "Forms".
 */
export function reservationRecordsLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  if (reservationType === RESERVATION_TYPE_VALUE.Document) {
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure) return "Procedures";
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form) return "Forms";
    return "Documents";
  }
  return "Drawings";
}

/**
 * Singular label for child (enmax_autocadsheet) rows.
 * Drawing → Drawing document; Form → Form.
 */
export function reservationChildNoun(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  return individualItemLabel(reservationType, documentSubtype);
}

/** Plural child label for lists and navigation copy, e.g. "Forms". */
export function reservationChildNounPlural(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  return individualItemLabelPlural(reservationType, documentSubtype);
}

export function reservationChildNounPluralLower(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  return reservationChildNounPlural(reservationType, documentSubtype).toLowerCase();
}

export function reservationChildNounSingularLower(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  return reservationChildNoun(reservationType, documentSubtype).toLowerCase();
}

/**
 * Deterministic display number for a base drawing/document and its child sheet.
 * For child-producing taxonomies (Drawing + Form), child items are rendered
 * as `<base>-sss` where `sss` is a 3-digit sheet suffix.
 */
/** Whether the taxonomy shows child rows in document lists (Drawing + Form; not Standard/Procedure). */
export function reservationHasChildItems(
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  if (reservationType === RESERVATION_TYPE_VALUE.Document) {
    return documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form;
  }
  return true;
}

/** Primary bulk-checkout button label — never "sheets" for Standard or Procedure. */
export function checkoutBulkLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
  _childNoun?: string,
  requireApproval = true,
): string {
  const verb = requireApproval ? "Request Check Out" : "Check Out";
  if (reservationType === RESERVATION_TYPE_VALUE.Document) {
    if (
      documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard
      || documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure
    ) {
      return requireApproval ? "Request Check Out — All Documents" : "Check Out All Documents";
    }
  }
  const plural = reservationChildNounPlural(reservationType, documentSubtype);
  return `${verb} — All ${plural}`;
}

/** Single-item checkout button label (sheet / document row). */
export function checkoutSingleLabel(requireApproval = true): string {
  return requireApproval ? "Request Check Out" : "Check Out";
}

/** Batch checkout button when multiple items are selected. */
export function checkoutSelectedLabel(count: number, requireApproval = true): string {
  const verb = requireApproval ? "Request Check Out" : "Check Out";
  return `${verb} (${count})`;
}

export function documentDisplayNumber(
  baseNumber?: string | null,
  sheetNumber?: number | null,
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  const base = (baseNumber ?? "").trim();
  if (sheetNumber == null || Number.isNaN(sheetNumber)) return base;
  if (!base) return String(sheetNumber);
  if (
    reservationType === RESERVATION_TYPE_VALUE.Document
    && (
      documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard
      || documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure
    )
  ) {
    return base;
  }
  return `${base}-${String(sheetNumber).padStart(3, "0")}`;
}

export * from "./numberingTerms";
