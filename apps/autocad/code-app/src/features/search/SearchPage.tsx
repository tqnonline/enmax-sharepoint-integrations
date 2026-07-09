import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Field,
  Select,
  Tab,
  TabList,
  Text,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { GridQueryFilterBar } from "../../components/DataGrid";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";
import {
  NUMBERING_GROUP_LABEL,
  NUMBERING_GROUP_PATTERN,
} from "../reserve/numberingTerms";
import { useReferenceData } from "../reserve/hooks/useReferenceData";
import { CompositionFilterFields } from "./CompositionFilterFields";
import { SearchResultsList } from "./SearchResultsList";
import { fetchSearchDocuments, type SearchDocumentRow } from "./useSearchDocuments";
import {
  emptyComposition,
  type DocumentSubtypeSearchFilter,
  type SearchListFilters,
  type SearchTab,
} from "./searchListFilters";
import {
  buildDocumentDetailUrl,
  filtersFromSearchParams,
  hasSearchPrefill,
  parseSearchTab,
} from "./searchUrlState";
import { usePageSize } from "../../config/usePageSize";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: tokens.spacingVerticalM,
    overflow: "hidden",
  },
  intro: {
    color: tokens.colorNeutralForeground3,
    maxWidth: "720px",
  },
  filters: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    flexShrink: 0,
  },
  results: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
});

const DOCUMENT_TYPE_OPTIONS: { value: DocumentSubtypeSearchFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "standard", label: "Standard Document" },
  { value: "procedure", label: "Procedure form" },
];

function initialFilters(): SearchListFilters {
  const { from, to } = defaultGridDateRange();
  return {
    number: "",
    from,
    to,
    documentSubtype: "all",
    peopleIds: [],
    composition: emptyComposition(),
  };
}

function parseTab(raw: string | null): SearchTab {
  return parseSearchTab(raw);
}

export function SearchPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageSize = usePageSize();
  const { data: refData } = useReferenceData();

  const [activeTab, setActiveTab] = useState<SearchTab>(() => parseTab(searchParams.get("tab")));
  const [filterDraft, setFilterDraft] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<SearchListFilters>(() => initialFilters());
  const [page, setPage] = useState(0);

  useEffect(() => {
    const tab = parseTab(searchParams.get("tab"));
    if (tab !== activeTab) setActiveTab(tab);
  }, [searchParams, activeTab]);

  useEffect(() => {
    if (!hasSearchPrefill(searchParams)) return;
    const prefilled = filtersFromSearchParams(searchParams, refData);
    const tab = parseTab(searchParams.get("tab"));
    setActiveTab(tab);
    setFilterDraft(prefilled);
    setAppliedFilters(prefilled);
    setPage(0);
  }, [searchParams, refData]);

  const queryKey = useMemo(
    () => ["search-documents", activeTab, appliedFilters, page, pageSize],
    [activeTab, appliedFilters, page, pageSize],
  );

  const { data, isFetching, isError } = useQuery({
    queryKey,
    enabled: true,
    queryFn: () => fetchSearchDocuments(activeTab, appliedFilters, {
      search: "",
      filters: {},
      sort: { column: "documentNumber", direction: "asc" },
      page,
      pageSize,
    }),
  });

  function handleTabChange(tab: SearchTab) {
    setActiveTab(tab);
    setSearchParams({ tab });
    setPage(0);
    setFilterDraft(initialFilters());
    setAppliedFilters(initialFilters());
  }

  function handleQuery() {
    if (!filterDraft.from || !filterDraft.to) return;
    setAppliedFilters({
      number: filterDraft.number,
      from: filterDraft.from,
      to: filterDraft.to,
      documentSubtype: filterDraft.documentSubtype,
      peopleIds: [...filterDraft.peopleIds],
      composition: { ...filterDraft.composition },
    });
    setPage(0);
  }

  function handleClear() {
    const cleared = initialFilters();
    setFilterDraft(cleared);
    setAppliedFilters(cleared);
    setPage(0);
  }

  const handleRowClick = useCallback((row: SearchDocumentRow) => {
    const returnTo = `${location.pathname}${location.search}`;
    navigate(buildDocumentDetailUrl({
      documentId: row.id,
      drawingId: row.drawingId,
      tab: activeTab,
      returnTo,
    }), { state: { returnTo } });
  }, [navigate, activeTab, location.pathname, location.search]);

  const emptyMessage = activeTab === "drawings"
    ? "No Drawing documents found. Try widening the numbering group filters or the date range."
    : "No Standard Documents or Procedure forms found. Try adjusting filters.";

  return (
    <div className={styles.root}>
      <div>
        <Title2 as="h1">Search</Title2>
        <Text className={styles.intro} size={300} block>
          Find Drawing documents, Standard Documents, and Procedure forms by issued number
          or {NUMBERING_GROUP_LABEL} ({NUMBERING_GROUP_PATTERN}). Results list each file you
          can open in SharePoint or view in detail.
        </Text>
      </div>

      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, d) => handleTabChange(d.value as SearchTab)}
      >
        <Tab value="drawings">Drawings (Drawing documents)</Tab>
        <Tab value="documents">Standard Documents &amp; Procedure forms</Tab>
      </TabList>

      <div className={styles.filters}>
        <GridQueryFilterBar
          numberLabel="Drawing document / Standard Document / Procedure form number"
          numberPlaceholder="e.g. GG-CG-00-ECS-AST-DD-0001-001"
          draft={{ number: filterDraft.number, from: filterDraft.from, to: filterDraft.to }}
          onDraftChange={(patch) => setFilterDraft((prev) => ({ ...prev, ...patch }))}
          onQuery={handleQuery}
          onClear={handleClear}
          isQuerying={isFetching}
          personLabel="Submitted or approved by"
          peopleIds={filterDraft.peopleIds}
          onPeopleChange={(ids) => setFilterDraft((prev) => ({ ...prev, peopleIds: ids }))}
          extraFields={activeTab === "documents" ? (
            <Field label="Type">
              <Select
                value={filterDraft.documentSubtype}
                onChange={(_, d) => setFilterDraft((prev) => ({
                  ...prev,
                  documentSubtype: d.value as DocumentSubtypeSearchFilter,
                }))}
                aria-label="Filter by document type"
              >
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </Field>
          ) : undefined}
        />

        <CompositionFilterFields
          refData={refData}
          value={filterDraft.composition}
          onChange={(patch) => setFilterDraft((prev) => ({
            ...prev,
            composition: { ...prev.composition, ...patch },
          }))}
        />
      </div>

      <div className={styles.results}>
        {isError && (
          <Text style={{ color: tokens.colorPaletteRedForeground1 }}>
            Search failed. Please try again.
          </Text>
        )}
        <SearchResultsList
          rows={data?.rows ?? []}
          totalCount={data?.totalCount ?? 0}
          page={page}
          pageSize={pageSize}
          isLoading={isFetching}
          hasQueried={true}
          emptyMessage={emptyMessage}
          onPageChange={setPage}
          onRowClick={handleRowClick}
        />
      </div>
    </div>
  );
}
