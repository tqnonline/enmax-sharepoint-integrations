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
  Toast,
  ToastTitle,
  Toaster,
  useToastController,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { GridQueryFilterBar } from "../../components/DataGrid";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";
import { usePageSize } from "../../config/usePageSize";
import { useGridDefaultFromDays } from "../../config/useGridDefaultFromDays";
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
  DOCUMENT_STATUS_OPTIONS,
  type DocumentStatusSearchFilter,
} from "./searchDocumentStatus";
import {
  buildDocumentDetailUrl,
  filtersFromSearchParams,
  hasSearchPrefill,
  parseSearchTab,
} from "./searchUrlState";

const SEARCH_TOASTER_ID = "search-page-toaster";
const NUMBER_FIELD_LABEL = "Drawing Document / Standard / Procedure / Form Number";
const NUMBER_FIELD_PLACEHOLDER = "e.g. GG-CG-00-ECS-AST-DD-0001-001";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    gap: tokens.spacingVerticalM,
    overflow: "hidden",
  },
  intro: {
    color: tokens.colorNeutralForeground2,
    maxWidth: "720px",
    flexShrink: 0,
  },
  filters: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    flexShrink: 0,
    maxHeight: "42vh",
    overflowY: "auto",
    paddingRight: tokens.spacingHorizontalXS,
  },
  results: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
});

const DOCUMENT_TYPE_OPTIONS: { value: DocumentSubtypeSearchFilter; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "standard", label: "Standard" },
  { value: "procedure", label: "Procedure" },
  { value: "form", label: "Form" },
];

function initialFilters(fromDays?: number): SearchListFilters {
  const { from, to } = defaultGridDateRange(new Date(), fromDays);
  return {
    number: "",
    from,
    to,
    documentSubtype: "all",
    documentStatus: "all",
    peopleIds: [],
    composition: emptyComposition(),
  };
}

export function SearchPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageSize = usePageSize();
  const fromDays = useGridDefaultFromDays();
  const { data: refData } = useReferenceData();
  const { dispatchToast } = useToastController(SEARCH_TOASTER_ID);

  const [activeTab, setActiveTab] = useState<SearchTab>(() => parseSearchTab(searchParams.get("tab")));
  const [filterDraft, setFilterDraft] = useState(() => initialFilters(fromDays));
  const [appliedFilters, setAppliedFilters] = useState(() => initialFilters(fromDays));
  const [page, setPage] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect -- router search params are an external state source */
  useEffect(() => {
    const tab = parseSearchTab(searchParams.get("tab"));
    if (tab !== activeTab) setActiveTab(tab);
  }, [searchParams, activeTab]);

  useEffect(() => {
    if (!hasSearchPrefill(searchParams)) return;
    const prefilled = filtersFromSearchParams(searchParams, refData, fromDays);
    const tab = parseSearchTab(searchParams.get("tab"));
    setActiveTab(tab);
    setFilterDraft(prefilled);
    setAppliedFilters(prefilled);
    setPage(0);
  }, [searchParams, refData, fromDays]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const queryKey = useMemo(
    () => ["search-page", activeTab, appliedFilters, page, pageSize],
    [activeTab, appliedFilters, page, pageSize],
  );

  const { data: documentData, isFetching, isError } = useQuery({
    queryKey: [...queryKey, "documents"],
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
    const params: Record<string, string> = { tab };
    if (searchParams.get("q")) params.q = searchParams.get("q")!;
    setSearchParams(params);
    setPage(0);
    const cleared = initialFilters(fromDays);
    setFilterDraft(cleared);
    setAppliedFilters(cleared);
  }

  function handleQuery() {
    const { from, to } = filterDraft;
    if (!from || !to) {
      dispatchToast(
        <Toast><ToastTitle>From and To dates are required to run a search.</ToastTitle></Toast>,
        { intent: "warning" },
      );
      return;
    }
    setAppliedFilters({
      number: filterDraft.number,
      from: filterDraft.from,
      to: filterDraft.to,
      documentSubtype: filterDraft.documentSubtype,
      documentStatus: filterDraft.documentStatus,
      peopleIds: [...filterDraft.peopleIds],
      composition: { ...filterDraft.composition },
    });
    setPage(0);
  }

  function handleClear() {
    const cleared = initialFilters(fromDays);
    setFilterDraft(cleared);
    setAppliedFilters(cleared);
    setPage(0);
  }

  const handleDocumentClick = useCallback((row: SearchDocumentRow) => {
    const returnTo = `${location.pathname}${location.search}`;
    navigate(buildDocumentDetailUrl({
      documentId: row.id,
      drawingId: row.drawingId,
      tab: activeTab,
      returnTo,
    }), { state: { returnTo } });
  }, [navigate, activeTab, location.pathname, location.search]);

  const emptyMessage = activeTab === "drawings"
    ? "No Drawing Documents Found. Try Widening The Numbering Group Filters Or The Date Range."
    : "No Standards, Procedures, Or Forms Found. Try Adjusting Filters.";

  return (
    <div className={styles.root}>
      <Toaster toasterId={SEARCH_TOASTER_ID} />
      <div>
        <Title2 as="h1">Search</Title2>
        <Text className={styles.intro} size={300} block>
          Find issued drawing documents, standards, procedures, and forms by number,
          numbering group, status, or date. Open a document to view detail or request
          Check Out when it is Available.
        </Text>
      </div>

      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, d) => handleTabChange(d.value as SearchTab)}
      >
        <Tab value="drawings">Drawings</Tab>
        <Tab value="documents">Standards, Procedures, Forms</Tab>
      </TabList>

      <div className={styles.filters}>
        <GridQueryFilterBar
          numberLabel={NUMBER_FIELD_LABEL}
          numberPlaceholder={NUMBER_FIELD_PLACEHOLDER}
          draft={{ number: filterDraft.number, from: filterDraft.from, to: filterDraft.to }}
          onDraftChange={(patch) => setFilterDraft((prev) => ({ ...prev, ...patch }))}
          onQuery={handleQuery}
          onClear={handleClear}
          isQuerying={isFetching}
          personLabel="Submitted Or Approved By"
          peopleIds={filterDraft.peopleIds}
          onPeopleChange={(ids) => setFilterDraft((prev) => ({ ...prev, peopleIds: ids }))}
          extraFields={(
            <>
              <Field label="Status">
                <Select
                  value={filterDraft.documentStatus}
                  onChange={(_, d) => setFilterDraft((prev) => ({
                    ...prev,
                    documentStatus: d.value as DocumentStatusSearchFilter,
                  }))}
                  aria-label="Filter by document status"
                >
                  {DOCUMENT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </Field>
              {activeTab === "documents" && (
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
              )}
            </>
          )}
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
          rows={documentData?.rows ?? []}
          totalCount={documentData?.totalCount ?? 0}
          page={page}
          pageSize={pageSize}
          isLoading={isFetching}
          hasQueried={true}
          emptyMessage={emptyMessage}
          onPageChange={setPage}
          onRowClick={handleDocumentClick}
        />
      </div>
    </div>
  );
}
