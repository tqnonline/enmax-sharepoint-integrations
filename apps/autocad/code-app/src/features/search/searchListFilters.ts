import type { GridFetchParams } from "../../components/DataGrid";
import { DOCUMENT_SUBTYPE_VALUE, RESERVATION_TYPE_VALUE } from "../reserve/terminology";
import { typeFilterClause } from "../reserve/taxonomyFilters";
import type { DocumentSubtypeFilter } from "../reserve/taxonomyFilters";

/** Drawing search type includes drawing rows as well as document subtypes. */
export type SearchDrawingTypeFilter = DocumentSubtypeFilter | "drawing";

export type SearchTab = "drawings" | "documents";

export type DocumentSubtypeSearchFilter = "all" | "standard" | "procedure";

export interface CompositionFilterIds {
  businessId: string;
  assetId: string;
  unitId: string;
  domainId: string;
  systemId: string;
  kindId: string;
}

export interface SearchListFilters {
  number: string;
  from: string;
  to: string;
  /** Documents tab only — narrows Standard vs Procedure. */
  documentSubtype: DocumentSubtypeSearchFilter;
  peopleIds: string[];
  composition: CompositionFilterIds;
}

export function emptyComposition(): CompositionFilterIds {
  return {
    businessId: "",
    assetId: "",
    unitId: "",
    domainId: "",
    systemId: "",
    kindId: "",
  };
}

export function tabDrawingSubtype(
  tab: SearchTab,
  subtype: DocumentSubtypeSearchFilter,
): SearchDrawingTypeFilter | "documents" {
  if (tab === "drawings") return "drawing";
  if (subtype === "standard") return "standard";
  if (subtype === "procedure") return "procedure";
  return "documents";
}

export function mergeDocumentSearchParams(
  tab: SearchTab,
  applied: SearchListFilters,
  params: GridFetchParams,
): GridFetchParams {
  const tabSubtype = tabDrawingSubtype(tab, applied.documentSubtype);
  const documentSubtypeFilter =
    tabSubtype === "documents"
      ? null
      : tabSubtype;

  const filters: GridFetchParams["filters"] = {
    ...params.filters,
    dateFrom: applied.from || null,
    dateTo: applied.to || null,
    peopleIds: applied.peopleIds.length > 0 ? applied.peopleIds : null,
    business: applied.composition.businessId || null,
    asset: applied.composition.assetId || null,
    unit: applied.composition.unitId || null,
    domain: applied.composition.domainId || null,
    system: applied.composition.systemId || null,
    kind: applied.composition.kindId || null,
  };

  if (tabSubtype === "documents") {
    filters.taxonomyScope = "documents";
  } else if (documentSubtypeFilter) {
    filters.documentSubtype = documentSubtypeFilter;
  }

  return {
    ...params,
    search: applied.number.trim() || params.search,
    filters,
  };
}

/** OData clause for the documents tab when subtype is "all". */
export function documentsTabClause(): string {
  return typeFilterClause("documents");
}

export function drawingSubtypeClause(subtype: SearchDrawingTypeFilter): string | null {
  if (subtype === "all") return null;
  if (subtype === "drawing") {
    return `(enmax_acdnreservationtype eq ${RESERVATION_TYPE_VALUE.Drawing} or enmax_acdnreservationtype eq null)`;
  }
  if (subtype === "standard") {
    return `enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Standard}`;
  }
  return `enmax_acdndocumentsubtype eq ${DOCUMENT_SUBTYPE_VALUE.Procedure}`;
}
