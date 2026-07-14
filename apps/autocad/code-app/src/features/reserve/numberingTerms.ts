/**
 * EEC Generation controlled numbering — business/UI terminology (Heather).
 *
 * | Pattern                         | Drawing              | Standard Document | Procedure        |
 * |---------------------------------|----------------------|-------------------|------------------|
 * | BB-AA-UU-DDD-SSS-KK             | Numbering group      | Numbering group   | Numbering group  |
 * | BB-AA-UU-DDD-SSS-KK-NNNN        | Drawing Number       | Standard Document | (base)           |
 * | BB-AA-UU-DDD-SSS-KK-NNNN to YYYY| Drawing Number Range | —                 | Procedure Number Range |
 * | BB-AA-UU-DDD-SSS-KK-NNNN-SSS    | Drawing Document     | —                 | Procedure Form   |
 */

export const NUMBERING_GROUP_LABEL = "Drawing/Document Numbering Group";
export const NUMBERING_GROUP_PATTERN = "BB-AA-UU-DDD-SSS-KK";
export const BASE_SEQUENCE_SLOT = "NNNN";
export const CHILD_SEQUENCE_SLOT = "SSS";
export const RANGE_WORD = "To";

const RESERVATION_TYPE_DRAWING = 1;
const RESERVATION_TYPE_DOCUMENT = 2;
const DOCUMENT_SUBTYPE_STANDARD = 1;
const DOCUMENT_SUBTYPE_PROCEDURE = 2;

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

function isDrawing(type?: number | null): boolean {
  return !type || type === RESERVATION_TYPE_DRAWING;
}

/** User-facing type label for grids, badges, and audit context. */
export function taxonomyTypeLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  if (isStandard(reservationType, documentSubtype)) return "Standard Document";
  if (isProcedure(reservationType, documentSubtype)) return "Procedure";
  return "Drawing";
}

/**
 * Label for the base issued number (…-NNNN).
 * Drawing → Drawing Number; Standard → Standard Document.
 */
export function baseNumberLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  if (isStandard(reservationType, documentSubtype)) return "Standard Document";
  if (isProcedure(reservationType, documentSubtype)) return "Procedure";
  return "Drawing Number";
}

/** Label for a reserved/applied sequence range (…-NNNN to YYYY). */
export function numberRangeLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string | null {
  if (isDrawing(reservationType)) return "Drawing Number Range";
  if (isProcedure(reservationType, documentSubtype)) return "Procedure Number Range";
  return null;
}

/**
 * Label for an individual child file (…-NNNN-SSS) or the standard base record.
 * Drawing → Drawing Document; Procedure → Procedure Form; Standard → Standard Document.
 */
export function individualItemLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  if (isStandard(reservationType, documentSubtype)) return "Standard Document";
  if (isProcedure(reservationType, documentSubtype)) return "Procedure Form";
  return "Drawing Document";
}

export function individualItemLabelPlural(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  if (isProcedure(reservationType, documentSubtype)) return "Procedure Forms";
  if (isDrawing(reservationType)) return "Drawing Documents";
  return "Standard Documents";
}

/** Filter / search field label for the number text box. */
export function searchNumberFieldLabel(
  reservationType?: number | null,
  documentSubtype?: number | null,
): string {
  return `${individualItemLabel(reservationType, documentSubtype)} Number`;
}

/** Generic search placeholder covering all searchable item kinds. */
export const GLOBAL_SEARCH_PLACEHOLDER =
  "Search reservations, drawing numbers, standard documents, procedure forms…";

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
