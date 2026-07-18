/**
 * EEC Generation controlled numbering — business/UI terminology (Heather).
 *
 * | Pattern                         | Drawing              | Standard Document | Procedure | Form            |
 * |---------------------------------|----------------------|-------------------|-----------|-----------------|
 * | BB-AA-UU-DDD-SSS-KK             | Numbering group      | Numbering group   | Numbering group | Numbering group |
 * | BB-AA-UU-DDD-SSS-KK-NNNN        | Drawing Number       | Standard Document | Procedure | Form (base)     |
 * | BB-AA-UU-DDD-SSS-KK-NNNN to YYYY| Drawing Number Range | —                 | —         | Form Number Range |
 * | BB-AA-UU-DDD-SSS-KK-NNNN-SSS    | Drawing Sheet        | —                 | —         | Form            |
 */

export const NUMBERING_GROUP_LABEL = "Coding Sequence";
export const NUMBERING_GROUP_PATTERN = "BB-AA-UU-DDD-SSS-KK";
export const BASE_SEQUENCE_SLOT = "NNNN";
export const CHILD_SEQUENCE_SLOT = "SSS";
export const RANGE_WORD = "To";

const RESERVATION_TYPE_DRAWING = 1;
const RESERVATION_TYPE_DOCUMENT = 2;
const DOCUMENT_SUBTYPE_DRAWING_DOCUMENT = 1;
const DOCUMENT_SUBTYPE_STANDARD = 3;
const DOCUMENT_SUBTYPE_PROCEDURE = 4;
const DOCUMENT_SUBTYPE_FORM = 5;

export type TaxonomyValues = {
  enmax_acdnreservationtype?: number | null;
  enmax_acdndocumentsubtype?: number | null;
};

function isStandard(type?: number | null, subtype?: number | null): boolean {
  return type === RESERVATION_TYPE_DOCUMENT && subtype === DOCUMENT_SUBTYPE_STANDARD;
}

function isProcedure(type?: number | null, subtype?: number | null): boolean {
  return type === RESERVATION_TYPE_DOCUMENT && subtype === DOCUMENT_SUBTYPE_PROCEDURE;
}

function isForm(type?: number | null, subtype?: number | null): boolean {
  return type === RESERVATION_TYPE_DOCUMENT && subtype === DOCUMENT_SUBTYPE_FORM;
}

function isDrawing(type?: number | null): boolean {
  return !type || type === RESERVATION_TYPE_DRAWING;
}

/** Drawing Document: type Drawing, base-only + singleton sheet (not the numbered-children Drawing subtype). */
function isDrawingDocument(type?: number | null, subtype?: number | null): boolean {
  return isDrawing(type) && subtype === DOCUMENT_SUBTYPE_DRAWING_DOCUMENT;
}

/** User-facing type label for grids, badges, and audit context. */
export function taxonomyTypeLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  if (isStandard(reservationType, documentSubtype)) return "Standard Document";
  if (isProcedure(reservationType, documentSubtype)) return "Procedure";
  if (isForm(reservationType, documentSubtype)) return "Form";
  if (isDrawingDocument(reservationType, documentSubtype)) return "Drawing Document";
  return "Drawing";
}

/**
 * Label for the base issued number (…-NNNN).
 * Drawing → Drawing Number; Drawing Document → Drawing Document (base-only,
 * mirrors Standard/Procedure); Standard → Standard Document; Procedure →
 * Procedure; Form → Form.
 */
export function baseNumberLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  if (isStandard(reservationType, documentSubtype)) return "Standard Document";
  if (isProcedure(reservationType, documentSubtype)) return "Procedure";
  if (isForm(reservationType, documentSubtype)) return "Form";
  if (isDrawingDocument(reservationType, documentSubtype)) return "Drawing Document";
  return "Drawing Number";
}

/**
 * Label for a reserved/applied sequence range (…-NNNN to YYYY). Base-only
 * subtypes (Standard, Procedure, Drawing Document) have no range; Drawing and
 * Form do.
 */
export function numberRangeLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string | null {
  if (isForm(reservationType, documentSubtype)) return "Form Number Range";
  if (isDrawingDocument(reservationType, documentSubtype)) return null;
  if (isStandard(reservationType, documentSubtype) || isProcedure(reservationType, documentSubtype)) return null;
  if (isDrawing(reservationType)) return "Drawing Number Range";
  return null;
}

/**
 * Label for an individual child file (…-NNNN-SSS) or the standard/procedure base record.
 * Drawing → Drawing Sheet; Drawing Document (base-only) → Drawing Document;
 * Form → Form; Standard/Procedure → their base labels.
 */
export function individualItemLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  if (isStandard(reservationType, documentSubtype)) return "Standard Document";
  if (isProcedure(reservationType, documentSubtype)) return "Procedure";
  if (isForm(reservationType, documentSubtype)) return "Form";
  if (isDrawingDocument(reservationType, documentSubtype)) return "Drawing Document";
  return "Drawing Sheet";
}

export function individualItemLabelPlural(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  if (isForm(reservationType, documentSubtype)) return "Forms";
  if (isProcedure(reservationType, documentSubtype)) return "Procedures";
  if (isDrawingDocument(reservationType, documentSubtype)) return "Drawing Documents";
  if (isDrawing(reservationType)) return "Drawing Sheets";
  return "Standard Documents";
}

/** Filter / search field label for the number text box. */
export function searchNumberFieldLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  return `${individualItemLabel(reservationType, documentSubtype)} Number`;
}

/** Generic search placeholder covering issued document/drawing numbers only. */
export const GLOBAL_SEARCH_PLACEHOLDER =
  "Search drawing documents, standard documents, procedures, forms…";

/** Joins composition codes into the numbering group (no NNNN suffix). */
export function formatNumberingGroup(codes: {
  businessCode?: string;
  assetCode?: string;
  unitCode?: string;
  domainCode?: string;
  systemCode?: string;
  kindCode?: string;
}): string {
  const seg = (v?: string) => (v && v.trim() ? v.trim() : "?");
  return [
    seg(codes.businessCode),
    seg(codes.assetCode),
    seg(codes.unitCode),
    seg(codes.domainCode),
    seg(codes.systemCode),
    seg(codes.kindCode),
  ].join("-");
}

/** Formats a 4-digit sequence range using the business "NNNN to YYYY" convention. */
export function formatBaseSequenceRange(first: number, last: number): string {
  const pad = (n: number) => String(n).padStart(4, "0");
  return first === last
    ? pad(first)
    : `${pad(first)} ${RANGE_WORD} ${pad(last)}`;
}
