import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useIsFetching } from "@tanstack/react-query";
import {
  Badge,
  CounterBadge,
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
import {
  fetchMyRecordCounts,
  fetchMyRecordAllCounts,
  fetchMyRecordRows,
  MY_RECORD_COUNT_CAP,
  type MyRecordRow,
  type MyRecordStateFilter,
  type MyRecordListFilters,
} from "./useMyRecords";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { useCompositionLookups, type CompositionMaps } from "../approvals/hooks/useCompositionLookups";
import { formatReservationDisplay } from "../approvals/compositionUtils";
import { DrawingDetailPanel } from "../search/DrawingDetailPanel";
import {
  EnmaxDataGrid,
  GridQueryFilterBar,
  submittedByColumn,
  approvedByColumn,
  sharePointColumn,
  sharePointUrlFrom,
  dateTimeColumn,
} from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import type { DrawingRow } from "../search/useSearchDrawings";
import { documentDisplayNumber } from "../reserve/terminology";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";
import {
  effectiveTypeFilter,
  type DocumentSubtypeFilter,
  type MyRecordTabFilter,
} from "../reserve/taxonomyFilters";
import type { GridQueryFilterDraft } from "../../components/DataGrid/GridQueryFilterBar";

const TOASTER_ID = "my-items-toaster";

const TYPE_TABS: { value: MyRecordTabFilter; label: string; url: string }[] = [
  { value: "drawing",   label: "Drawings",                                      url: "drawings" },
  { value: "documents", label: "Standard Documents, Procedures & Forms",        url: "documents" },
];

const STATE_TABS: { value: MyRecordStateFilter; label: string; url: string }[] = [
  { value: "reservations",     label: "My Reservations",  url: "reservations" },
  { value: "available",        label: "Available",        url: "available" },
  { value: "pendingapproval",  label: "Pending Approval", url: "pending-approval" },
  { value: "checkedout",       label: "Checked Out",      url: "checkedout" },
];

const DOCUMENT_TYPE_OPTIONS: { value: DocumentSubtypeFilter; label: string }[] = [
  { value: "all",       label: "All types" },
  { value: "standard",  label: "Standard Document" },
  { value: "procedure", label: "Procedure form" },
];

const STATUS_COLORS: Record<string, "success" | "warning" | "danger" | "informative" | undefined> = {
  Pending: "warning",
  "Pending Approval": "warning",
  Available: "success",
  "Checked Out": "warning",
  Approved: "success",
  "Approved — awaiting numbers": "informative",
  "Approved — awaiting items": "informative",
  Declined: "danger",
  Cancelled: undefined,
};

const useStyles = makeStyles({
  root:       { display: "flex", flexDirection: "column", height: "100%", gap: tokens.spacingVerticalM },
  toolbar:    { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, flexWrap: "wrap" },
  grid:       { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
});

function parseTabParam(raw: string | null): MyRecordTabFilter {
  if (raw === "documents" || raw === "standard" || raw === "procedure") return "documents";
  return "drawing";
}

function parseSubtypeParam(raw: string | null): DocumentSubtypeFilter {
  if (raw === "standard" || raw === "procedure") return raw;
  return "all";
}

function parseStateParam(raw: string | null): MyRecordStateFilter {
  if (raw === "available") return "available";
  if (raw === "checkedout" || raw === "checked-out") return "checkedout";
  if (raw === "pending-approval" || raw === "pendingapproval") return "pendingapproval";
  if (raw === "pending" || raw === "reservations") return "reservations";
  return "reservations";
}

function initialFilterDraft(): GridQueryFilterDraft & { documentSubtype: DocumentSubtypeFilter; peopleIds: string[] } {
  const dates = defaultGridDateRange();
  return { number: "", ...dates, documentSubtype: "all", peopleIds: [] };
}

function personFilterLabel(state: MyRecordStateFilter): string {
  if (state === "reservations") return "Submitted or approved by";
  if (state === "available") return "Created or checked in by";
  return "Checked out or checked in by";
}

function resetFiltersForTab(tab: MyRecordTabFilter): MyRecordListFilters {
  const { from, to } = defaultGridDateRange();
  return {
    number: "",
    from,
    to,
    documentSubtype: tab === "documents" ? "all" : "all",
    peopleIds: [],
  };
}

function compositionFor(r: MyRecordRow, maps?: CompositionMaps): string {
  return formatReservationDisplay({
    businessCode: maps?.bizMap.get(r.businessId ?? ""),
    assetCode:    maps?.assetMap.get(r.assetId ?? ""),
    unitCode:     maps?.unitMap.get(r.unitId ?? ""),
    domainCode:   maps?.domainMap.get(r.domainId ?? ""),
    systemCode:   maps?.sysMap.get(r.systemId ?? ""),
    kindCode:     maps?.kindMap.get(r.kindId ?? ""),
    enmax_acdnissuednumbers: r.issuedNumbers ?? "",
    sequenceType: r.sequenceType,
    targetDrawingId: r.targetDrawingId,
    targetDrawingNumber: r.targetDrawingNumber,
    appendFirst: r.appendFirst,
    appendLast: r.appendLast,
  });
}

function displayNumber(r: MyRecordRow, maps?: CompositionMaps): string {
  if (r.source === "reservation") {
    const comp = compositionFor(r, maps);
    return comp || r.reservationNumber || r.number;
  }
  return documentDisplayNumber(
    r.baseNumber ?? r.number,
    r.sheetNumber,
    r.enmax_acdnreservationtype,
    r.enmax_acdndocumentsubtype,
  );
}

function makeDrawingRow(r: MyRecordRow): DrawingRow {
  return {
    id: r.drawingId ?? r.id,
    enmax_acdnnumber:          r.baseNumber ?? r.number,
    enmax_acdntitle:           r.title,
    enmax_acdncurrentrevision: "",
    enmax_acdnrevisiondate:    r.revisionDate,
    enmax_acdnstate:           r.state,
    enmax_acdnsheetcount:      0,
    typeLabel:                 r.typeLabel,
    enmax_acdnsplibraryurl:    r.libraryUrl,
    enmax_acdnspdestinationurl: r.destinationUrl,
    enmax_acdnreservationtype: r.enmax_acdnreservationtype,
    enmax_acdndocumentsubtype: r.enmax_acdndocumentsubtype,
    enmax_acdnpresentindropoff: false,
    enmax_acdnpresentindestination: false,
    _enmax_acdnbusiness_value:   "",
    _enmax_acdnasset_value:      "",
    _enmax_acdnunit_value:       "",
    _enmax_acdndomain_value:     "",
    _enmax_acdnsystem_value:     "",
    _enmax_acdnkind_value:       "",
    _enmax_acdnrecordtype_value: "",
    _enmax_acdnrecordphase_value:"",
    _enmax_acdnvendor_value:     "",
    _createdby_value:            "",
    businessDisplay: r.businessDisplay, assetDisplay: r.assetDisplay, unitDisplay: r.unitDisplay,
    domainDisplay: r.domainDisplay, systemDisplay: r.systemDisplay, kindDisplay: r.kindDisplay,
    recordTypeDisplay: "", recordPhaseDisplay: "",
    vendorDisplay: "", requesterDisplay: "",
    submittedById: "", submittedByName: "", approvedById: "", approvedByName: "",
  };
}

export function MyItemsPage() {
  const styles   = useStyles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: user }    = useCurrentUser();
  const userId            = user?.id ?? "";
  const { data: compMaps } = useCompositionLookups();
  const { dispatchToast } = useToastController(TOASTER_ID);

  const activeTab  = parseTabParam(searchParams.get("type"));
  const activeState = parseStateParam(searchParams.get("state"));
  const [panelDrawing, setPanelDrawing] = useState<DrawingRow | null>(null);

  const [filterDraft, setFilterDraft] = useState(() => ({
    ...initialFilterDraft(),
    documentSubtype: parseSubtypeParam(searchParams.get("subtype")),
  }));
  const [appliedFilters, setAppliedFilters] = useState<MyRecordListFilters>(() => ({
    ...resetFiltersForTab(parseTabParam(searchParams.get("type"))),
    documentSubtype: parseSubtypeParam(searchParams.get("subtype")),
  }));

  const dataTypeFilter = effectiveTypeFilter(activeTab, appliedFilters.documentSubtype);

  const displayNumberFn = useCallback(
    (r: MyRecordRow) => displayNumber(r, compMaps),
    [compMaps],
  );

  const { data: counts } = useQuery({
    queryKey: ["my-record-counts", userId, dataTypeFilter, appliedFilters],
    enabled: !!userId,
    queryFn: () => fetchMyRecordCounts(userId, dataTypeFilter, appliedFilters, displayNumberFn),
    staleTime: 30_000,
  });

  const { data: allCounts } = useQuery({
    queryKey: ["my-record-all-counts", userId, dataTypeFilter],
    enabled: !!userId,
    queryFn: () => fetchMyRecordAllCounts(userId, dataTypeFilter),
    staleTime: 60_000,
  });

  const queryKey = useMemo(
    () => ["my-records", userId, dataTypeFilter, activeState, appliedFilters],
    [userId, dataTypeFilter, activeState, appliedFilters],
  );

  const isFetching = useIsFetching({ queryKey }) > 0;

  const fetcher = useCallback(
    (params: GridFetchParams) => {
      if (!userId) return Promise.resolve({ rows: [] as MyRecordRow[], totalCount: 0 });
      return fetchMyRecordRows(
        userId,
        dataTypeFilter,
        activeState,
        { ...params, search: "" },
        appliedFilters,
        displayNumberFn,
      );
    },
    [userId, dataTypeFilter, activeState, appliedFilters, displayNumberFn],
  );

  const setTabParams = useCallback((
    tab: MyRecordTabFilter,
    state: MyRecordStateFilter,
    subtype?: DocumentSubtypeFilter,
  ) => {
    const typeUrl  = TYPE_TABS.find(t => t.value === tab)?.url ?? "drawings";
    const stateUrl = STATE_TABS.find(s => s.value === state)?.url ?? "reservations";
    const next: Record<string, string> = { type: typeUrl, state: stateUrl };
    if (tab === "documents" && subtype && subtype !== "all") {
      next.subtype = subtype;
    }
    setSearchParams(next, { replace: true });
  }, [setSearchParams]);

  function handleQuery() {
    if (!filterDraft.from || !filterDraft.to) {
      dispatchToast(
        <Toast><ToastTitle>From and To dates are required to run a query.</ToastTitle></Toast>,
        { intent: "warning" },
      );
      return;
    }
    const next: MyRecordListFilters = {
      number: filterDraft.number,
      from: filterDraft.from,
      to: filterDraft.to,
      documentSubtype: activeTab === "documents" ? filterDraft.documentSubtype : "all",
      peopleIds: filterDraft.peopleIds,
    };
    setAppliedFilters(next);
    if (activeTab === "documents" && filterDraft.documentSubtype !== "all") {
      setTabParams(activeTab, activeState, filterDraft.documentSubtype);
    }
    dispatchToast(
      <Toast>
        <ToastTitle>
          Query applied — showing records from {filterDraft.from || "any date"} to {filterDraft.to || "any date"}.
        </ToastTitle>
      </Toast>,
      { intent: "success" },
    );
  }

  function handleClear() {
    const cleared = {
      ...resetFiltersForTab(activeTab),
      documentSubtype: "all" as DocumentSubtypeFilter,
    };
    setFilterDraft(cleared);
    setAppliedFilters(cleared);
    if (activeTab === "documents") {
      setTabParams(activeTab, activeState, "all");
    }
    dispatchToast(
      <Toast>
        <ToastTitle>Filters cleared — showing the last 30 days.</ToastTitle>
      </Toast>,
      { intent: "info" },
    );
  }

  const columns = useMemo<ColumnDef<MyRecordRow>[]>(() => {
    const sharePoint = sharePointColumn<MyRecordRow>(
      (r) => sharePointUrlFrom(r.libraryUrl, r.destinationUrl),
    );

    const base: ColumnDef<MyRecordRow>[] = [
      {
        id: "number",
        header: activeState === "reservations" ? "Reservation #" : "Issued number",
        accessor: r => displayNumber(r, compMaps),
        sortable: activeState !== "reservations",
        width: 220,
        cell: r => <Text weight="semibold" title={displayNumber(r, compMaps)}>{displayNumber(r, compMaps)}</Text>,
      },
      sharePoint,
      {
        id: "typeLabel", header: "Type",
        accessor: r => r.typeLabel,
        sortable: true,
        width: 160,
        cell: r => <Text>{r.typeLabel}</Text>,
      },
      {
        id: "statusLabel", header: "Status",
        accessor: r => r.statusLabel,
        sortable: true,
        width: 150,
        cell: r => (
          <Badge appearance="tint" color={STATUS_COLORS[r.statusLabel]}>
            {r.statusLabel}
          </Badge>
        ),
      },
    ];

    if (activeState === "reservations") {
      base.push(
        dateTimeColumn<MyRecordRow>({ id: "createdOn", header: "Submitted On", accessor: r => r.createdOn, width: 150 }),
        dateTimeColumn<MyRecordRow>({ id: "approvedOn", header: "Approved On", accessor: r => r.approvedOn, width: 150 }),
      );
    } else if (activeState === "pendingapproval") {
      base.push(
        dateTimeColumn<MyRecordRow>({ id: "checkedOutOn", header: "Requested On", accessor: r => r.checkedOutOn || r.createdOn, width: 170 }),
        dateTimeColumn<MyRecordRow>({ id: "createdOn", header: "Created On", accessor: r => r.createdOn, width: 150 }),
      );
    } else {
      base.push(
        dateTimeColumn<MyRecordRow>({ id: "checkedOutOn", header: "Last Checked Out On", accessor: r => r.checkedOutOn, width: 170 }),
        dateTimeColumn<MyRecordRow>({ id: "checkedInOn", header: "Last Checked In On", accessor: r => r.checkedInOn, width: 170 }),
        dateTimeColumn<MyRecordRow>({ id: "revisionDate", header: "Last Updated On", accessor: r => r.revisionDate, width: 170 }),
        dateTimeColumn<MyRecordRow>({ id: "createdOn", header: "Created On", accessor: r => r.createdOn, width: 150 }),
      );
    }

    if (activeState === "reservations") {
      base.push({
        id: "reason",
        header: "Reason",
        accessor: r => r.title,
        sortable: true,
        visibleByDefault: true,
        width: 280,
        cell: r => <Text title={r.title}>{r.title || "—"}</Text>,
      });
    }

    base.push(
      submittedByColumn<MyRecordRow>({
        width: 160,
        header:
          activeState === "reservations" ? "Submitted By"
          : activeState === "checkedout" || activeState === "pendingapproval" ? "Checked Out By"
          : "Created By",
      }),
      approvedByColumn<MyRecordRow>({
        width: 160,
        header:
          activeState === "reservations" ? "Approved By"
          : "Checked In By",
      }),
      { id: "business", header: "Business", accessor: r => r.businessDisplay || compMaps?.bizMap.get(r.businessId ?? "") || "", sortable: true, width: 100 },
      { id: "asset", header: "Asset", accessor: r => r.assetDisplay || compMaps?.assetMap.get(r.assetId ?? "") || "", sortable: true, width: 100 },
      { id: "unit", header: "Unit", accessor: r => r.unitDisplay || compMaps?.unitMap.get(r.unitId ?? "") || "", sortable: true, width: 72 },
      { id: "domain", header: "Domain", accessor: r => r.domainDisplay || compMaps?.domainMap.get(r.domainId ?? "") || "", sortable: true, width: 110 },
      { id: "system", header: "System", accessor: r => r.systemDisplay || compMaps?.sysMap.get(r.systemId ?? "") || "", sortable: true, width: 100 },
      { id: "kind", header: "Kind", accessor: r => r.kindDisplay || compMaps?.kindMap.get(r.kindId ?? "") || "", sortable: true, width: 100 },
    );

    return base;
  }, [activeState, compMaps]);

  const defaultSort = activeState === "reservations"
    ? { column: "createdOn", direction: "desc" as const }
    : activeState === "checkedout" || activeState === "pendingapproval"
      ? { column: "checkedOutOn", direction: "desc" as const }
      : { column: "revisionDate", direction: "desc" as const };

  const emptyMessages: Record<MyRecordStateFilter, string> = {
    reservations:     "No reservations in the selected range.",
    available:        "No available items in the selected range.",
    pendingapproval:  "No items pending approval in the selected range.",
    checkedout:       "No checked-out items in the selected range.",
  };

  const numberLabel = activeState === "reservations"
    ? "Reservation #"
    : "Issued number";

  return (
    <div className={styles.root}>
      <Toaster toasterId={TOASTER_ID} />

      <div className={styles.toolbar}>
        <Title2 as="h1">My Reservations</Title2>
      </div>

      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, d) => {
          const tab = d.value as MyRecordTabFilter;
          const reset = resetFiltersForTab(tab);
          setFilterDraft({ ...reset, documentSubtype: "all" });
          setAppliedFilters(reset);
          setTabParams(tab, activeState, "all");
        }}
      >
        {TYPE_TABS.map(t => (
          <Tab key={t.value} value={t.value}>{t.label}</Tab>
        ))}
      </TabList>

      <TabList
        selectedValue={activeState}
        onTabSelect={(_, d) => {
          const state = d.value as MyRecordStateFilter;
          const reset = resetFiltersForTab(activeTab);
          setFilterDraft({ ...reset, documentSubtype: filterDraft.documentSubtype });
          setAppliedFilters(reset);
          setTabParams(activeTab, state, filterDraft.documentSubtype);
        }}
      >
        {STATE_TABS.map(s => {
          const count = counts?.[s.value];
          return (
            <Tab key={s.value} value={s.value}>
              {s.label}
              {count && count.value > 0 && (
                <CounterBadge
                  count={count.capped ? MY_RECORD_COUNT_CAP + 1 : count.value}
                  overflowCount={MY_RECORD_COUNT_CAP}
                  color={s.value === "reservations" ? "important" : s.value === "checkedout" ? "informative" : s.value === "pendingapproval" ? "danger" : "brand"}
                  size="small"
                  style={{ marginLeft: "6px" }}
                />
              )}
            </Tab>
          );
        })}
      </TabList>

      <GridQueryFilterBar
        numberLabel={numberLabel}
        draft={{ number: filterDraft.number, from: filterDraft.from, to: filterDraft.to }}
        onDraftChange={(patch) => setFilterDraft((prev) => ({ ...prev, ...patch }))}
        onQuery={handleQuery}
        onClear={handleClear}
        isQuerying={isFetching}
        personLabel={personFilterLabel(activeState)}
        peopleIds={filterDraft.peopleIds}
        onPeopleChange={(ids) => setFilterDraft((prev) => ({ ...prev, peopleIds: ids }))}
        extraFields={activeTab === "documents" ? (
          <Field label="Type">
            <Select
              value={filterDraft.documentSubtype}
              onChange={(_, d) => setFilterDraft((prev) => ({
                ...prev,
                documentSubtype: d.value as DocumentSubtypeFilter,
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

      <div className={styles.grid}>
        <EnmaxDataGrid
          queryKey={queryKey}
          fetcher={fetcher}
          columns={columns}
          rowKey={r => r.id}
          onRowClick={r => {
            if (r.source === "reservation") navigate(`/reservations/${r.id}`);
            else setPanelDrawing(makeDrawingRow(r));
          }}
          exportFileName={`my-${activeState}`}
          defaultSort={defaultSort}
          enableQuickSearch={false}
          emptyMessage={emptyMessages[activeState]}
          errorMessage="Failed to load items."
          allRecordsCount={allCounts?.[activeState]?.value}
        />
      </div>

      <DrawingDetailPanel drawing={panelDrawing} onClose={() => setPanelDrawing(null)} />
    </div>
  );
}
