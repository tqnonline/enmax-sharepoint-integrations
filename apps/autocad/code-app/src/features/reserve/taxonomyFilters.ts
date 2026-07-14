import type { ReserveForm } from "./schema";
import { DOCUMENT_SUBTYPE_VALUE, RESERVATION_TYPE_VALUE } from "./terminology";

export type MyRecordTypeFilter = "drawing" | "standard" | "procedure" | "form" | "documents";

/** UI tab filter — drawings vs merged documents tab. */
export type MyRecordTabFilter = "drawing" | "documents";

export type DocumentSubtypeFilter = "all" | "standard" | "procedure" | "form";

export function effectiveTypeFilter(
  tab: MyRecordTabFilter,
  subtype: DocumentSubtypeFilter,
): MyRecordTypeFilter {
  if (tab === "drawing") return "drawing";
  if (subtype === "standard") return "standard";
  if (subtype === "procedure") return "procedure";
  if (subtype === "form") return "form";
  return "documents";
}

/** OData filter matching WS1a taxonomy on reservation/drawing rows (ADR 0001). */
export function taxonomyFilterClause(
  reservationType: ReserveForm["reservationType"],
  documentSubtype?: ReserveForm["documentSubtype"],
): string {
  if (reservationType === "Document") {
    if (documentSubtype === "Standard") {
      return `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Document} and enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Standard})`;
    }
    if (documentSubtype === "Procedure") {
      return `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Document} and enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Procedure})`;
    }
    if (documentSubtype === "Form") {
      return `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Document} and enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Form})`;
    }
  }
  // Drawing + legacy null-type rows behave as Drawing.
  return `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Drawing} or enmax_acdnreservationtype eq null)`;
}

export function typeFilterClause(typeFilter: MyRecordTypeFilter): string {
  switch (typeFilter) {
    case "documents":
      return `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Document} and (enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Standard} or enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Procedure} or enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Form}))`;
    case "standard":
      return `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Document} and enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Standard})`;
    case "procedure":
      return `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Document} and enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Procedure})`;
    case "form":
      return `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Document} and enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Form})`;
    default:
      return `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Drawing} or enmax_acdnreservationtype eq null)`;
  }
}

/** Client-side taxonomy match — mirrors {@link typeFilterClause} without OData `eq null`. */
export function reservationMatchesTypeFilter(
  typeFilter: MyRecordTypeFilter,
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  const rt = reservationType ?? null;
  const ds = documentSubtype ?? null;
  switch (typeFilter) {
    case "documents":
      return rt === RESERVATION_TYPE_VALUE.Document
        && (
          ds === DOCUMENT_SUBTYPE_VALUE.Standard
          || ds === DOCUMENT_SUBTYPE_VALUE.Procedure
          || ds === DOCUMENT_SUBTYPE_VALUE.Form
        );
    case "standard":
      return rt === RESERVATION_TYPE_VALUE.Document && ds === DOCUMENT_SUBTYPE_VALUE.Standard;
    case "procedure":
      return rt === RESERVATION_TYPE_VALUE.Document && ds === DOCUMENT_SUBTYPE_VALUE.Procedure;
    case "form":
      return rt === RESERVATION_TYPE_VALUE.Document && ds === DOCUMENT_SUBTYPE_VALUE.Form;
    default:
      return rt === RESERVATION_TYPE_VALUE.Drawing || rt === null;
  }
}
