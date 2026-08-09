import type { ReserveForm } from "./schema";
import {
  individualItemLabel,
  individualItemLabelPlural,
  taxonomyTypeLabel,
} from "./numberingTerms";

// Dataverse option values for the WS1a taxonomy columns.
export const RESERVATION_TYPE_VALUE = { Drawing: 1, Document: 2 } as const;
export const DOCUMENT_SUBTYPE_VALUE = {
  DrawingDocument: 1,
  Drawing: 2,
  Standard: 3,
  Procedure: 4,
  Form: 5,
} as const;

export interface ReserveTerminology {
  /** Human label for the reservation type, e.g. "Drawing", "Standard". */
  typeLabel: string;
  /** Singular base noun, e.g. "drawing", "standard", "procedure". */
  baseNoun: string;
  /** Plural base noun, e.g. "drawings". */
  baseNounPlural: string;
  /** Child item noun, or null when the type is base-only (Standard / Procedure). */
  childNoun: string | null;
  /** Whether this type produces child items (-sss). Standard and Procedure are base-only. */
  createsChildren: boolean;
}

/**
 * Type-aware terminology for the reserve wizard (ADR 0001, Heather numbering model;
 * docs/drawing-document-subtype-CONTRACT.md).
 * - Drawing Document → single base-only Drawing Document (no numbered children)
 * - Drawing          → base Drawing Number + child Drawing sheets (-SSS)
 * - Standard         → single Standard (no children)
 * - Procedure        → Procedure bases + optional Form children (-SSS) when sheets ≥ 1
 * - Form             → Form Number range + child Forms (-SSS); Existing-only
 */
export function reserveTerminology(
  reservationType: ReserveForm["reservationType"],
  documentSubtype: ReserveForm["documentSubtype"],
): ReserveTerminology {
  const type = reservationType === "Document"
    ? RESERVATION_TYPE_VALUE.Document
    : RESERVATION_TYPE_VALUE.Drawing;
  const subtype = documentSubtype ? DOCUMENT_SUBTYPE_VALUE[documentSubtype] : undefined;

  if (reservationType === "Document" && documentSubtype === "Standard") {
    return {
      typeLabel: taxonomyTypeLabel(type, subtype),
      baseNoun: "standard",
      baseNounPlural: "standards",
      childNoun: null,
      createsChildren: false,
    };
  }
  if (reservationType === "Document" && documentSubtype === "Procedure") {
    return {
      typeLabel: taxonomyTypeLabel(type, subtype),
      baseNoun: "procedure",
      baseNounPlural: "procedures",
      childNoun: "Form",
      createsChildren: true,
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
  // Drawing Document: base-only + singleton sheet — no numbered children (-SSS).
  if (documentSubtype === "DrawingDocument") {
    return {
      typeLabel: taxonomyTypeLabel(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.DrawingDocument),
      baseNoun: "drawing document",
      baseNounPlural: "drawing documents",
      childNoun: null,
      createsChildren: false,
    };
  }
  const child = individualItemLabel(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.Drawing);
  return {
    typeLabel: taxonomyTypeLabel(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.Drawing),
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
 * rows). Drawing -> "Drawings", Standard -> "Standards", Procedure -> "Procedures", Form -> "Forms".
 */
export function reservationRecordsLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  if (reservationType === RESERVATION_TYPE_VALUE.Document) {
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure) return "Procedures";
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form) return "Forms";
    return "Standards";
  }
  return "Drawings";
}

/**
 * Singular label for child (enmax_autocadsheet) rows.
 * Drawing → Drawing Sheet; Form → Form.
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
/**
 * Whether the taxonomy shows child rows in document lists.
 * Base-only subtypes (Standard, Procedure, Drawing Document) do not; Drawing and
 * Form do.
 */
export function isBaseOnlyDocument(
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  if (
    reservationType === RESERVATION_TYPE_VALUE.Drawing
    && documentSubtype === DOCUMENT_SUBTYPE_VALUE.DrawingDocument
  ) {
    return true;
  }
  // Standard stays base-only. Procedure may carry Form children when sheets ≥ 1
  // at issuance; list UIs still treat Procedure hosts as showing child forms.
  return reservationType === RESERVATION_TYPE_VALUE.Document
    && documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard;
}

export function reservationHasChildItems(
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  if (isBaseOnlyDocument(reservationType, documentSubtype)) return false;
  if (reservationType === RESERVATION_TYPE_VALUE.Document) {
    return documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form
      || documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure;
  }
  // Drawing (numbered) + legacy null subtype: children.
  return documentSubtype !== DOCUMENT_SUBTYPE_VALUE.DrawingDocument;
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
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard) {
      return requireApproval ? "Request Check Out — All Standards" : "Check Out All Standards";
    }
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure) {
      return requireApproval ? "Request Check Out — All Procedures" : "Check Out All Procedures";
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
  const isBaseOnly = isBaseOnlyDocument(reservationType, documentSubtype);
  if (isBaseOnly) {
    return base;
  }
  return `${base}-${String(sheetNumber).padStart(3, "0")}`;
}

export * from "./numberingTerms";
