import { useState, useCallback, useMemo } from "react";
import {
  Badge,
  Button,
  Field,
  Select,
  Text,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular } from "@fluentui/react-icons";
import { Enmax_autocadauditeventsService } from "../../generated";
import { useUserRole } from "../../auth/useUserRole";
import { exportToCsv } from "../../components/DataGrid/csvExport";
import { EnmaxDataGrid, GridQueryFilterBar, dateTimeColumn } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams, GridQueryFilterDraft } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { auditEventColor } from "./auditPills";
import { buildAuditFilter, type AppliedFilters } from "./auditFilter";
import { logDataverseError } from "../../components/DataGrid/dataverseError";
import { formatGridDateTime } from "../../lib/formatDateTime";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";

const EVENTS: Record<number, string> = {
  0: "None",
  1: "Created",
  2: "State Changed",
  3: "Approval Granted",
  4: "Approval Denied",
  5: "Override Used",
  6: "Force Checked In",
  7: "Config Changed",
  8: "Reference Data Changed",
  9: "Finalized",
};

const SOURCES: Record<number, string> = {
  1: "Code App",
  2: "Admin App",
  3: "Flow",
  4: "Action",
};

const MAX_AUDIT_ROWS = 5000;

interface AuditRow {
  id: string;
  createdOn: string;
  event: number;
  eventLabel: string;
  subjectTable: string;
  subjectId: string;
  fromState: string;
  toState: string;
  reason: string;
  source: number;
  sourceLabel: string;
  actedById: string;
  actedBy: string;
  actedOnBehalfOf: string;
}

type AuditRaw = {
  enmax_autocadauditeventid: string;
  createdon?: string;
  enmax_acdnevent?: number;
  enmax_acdnsource?: number;
  enmax_acdnsubjecttable?: string;
  enmax_acdnsubjectid?: string;
  enmax_acdnfromstate?: string;
  enmax_acdntostate?: string;
  enmax_acdnreason?: string;
  "_enmax_acdnactedby_value"?: string;
  "_enmax_acdnactedby_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnactedonbehalfof_value@OData.Community.Display.V1.FormattedValue"?: string;
};

function toAuditRow(r: AuditRaw): AuditRow {
  const event  = r.enmax_acdnevent  ?? 0;
  const source = r.enmax_acdnsource ?? 0;
  return {
    id:              r.enmax_autocadauditeventid,
    createdOn:       r.createdon ?? "",
    event,
    eventLabel:      EVENTS[event]  ?? String(event),
    subjectTable:    r.enmax_acdnsubjecttable ?? "",
    subjectId:       r.enmax_acdnsubjectid    ?? "",
    fromState:       r.enmax_acdnfromstate    ?? "",
    toState:         r.enmax_acdntostate      ?? "",
    reason:          r.enmax_acdnreason       ?? "",
    source,
    sourceLabel:     SOURCES[source] ?? String(source),
    actedById:       r._enmax_acdnactedby_value ?? "",
    actedBy:         r["_enmax_acdnactedby_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    actedOnBehalfOf: r["_enmax_acdnactedonbehalfof_value@OData.Community.Display.V1.FormattedValue"] ?? "",
  };
}

const AUDIT_COLS: ColumnDef<AuditRow>[] = [
  dateTimeColumn<AuditRow>({
    id: "createdOn",
    header: "Acted On",
    accessor: r => r.createdOn,
    cell: r => <Text size={200}>{formatGridDateTime(r.createdOn)}</Text>,
  }),
  { id: "eventLabel",      header: "Event",          accessor: r => r.eventLabel,                         sortable: true, cell: r => <Badge appearance="filled" color={auditEventColor(r.event)}>{r.eventLabel}</Badge> },
  { id: "subjectTable",    header: "Subject Table",  accessor: r => r.subjectTable,                       sortable: true, cell: r => <Text size={200}>{r.subjectTable}</Text> },
  { id: "subjectId",       header: "Subject ID",     accessor: r => r.subjectId,                          sortable: true, cell: r => <Text size={200}>{r.subjectId}</Text> },
  { id: "fromTo",          header: "From → To",      accessor: r => `${r.fromState} → ${r.toState}`,      cell: r => <>{(r.fromState || r.toState) && <Text size={200}>{r.fromState} → {r.toState}</Text>}</> },
  { id: "reason",          header: "Reason",         accessor: r => r.reason,                             cell: r => <Text size={200}>{r.reason.slice(0, 80)}</Text> },
  { id: "sourceLabel",     header: "Source",         accessor: r => r.sourceLabel,                        sortable: true, cell: r => <Text size={200}>{r.sourceLabel}</Text> },
  { id: "actedBy",         header: "Acted By",       accessor: r => r.actedBy },
  { id: "actedOnBehalfOf", header: "On Behalf Of",   accessor: r => r.actedOnBehalfOf,                   visibleByDefault: false },
];

const useStyles = makeStyles({
  root:    { display: "flex", flexDirection: "column", height: "100%", gap: tokens.spacingVerticalM },
  spacer:  { flex: 1 },
  grid:    { flex: 1, overflow: "hidden" },
});

type AuditFilterDraft = GridQueryFilterDraft & {
  filterEvent: string;
  filterTable: string;
  filterSource: string;
  peopleIds: string[];
};

function defaultAuditDraft(): AuditFilterDraft {
  const { from, to } = defaultGridDateRange();
  return {
    number: "",
    from,
    to,
    filterEvent: "",
    filterTable: "",
    filterSource: "",
    peopleIds: [],
  };
}

function draftToApplied(draft: AuditFilterDraft): AppliedFilters {
  return {
    dateFrom: draft.from,
    dateTo: draft.to,
    filterEvent: draft.filterEvent,
    filterTable: draft.filterTable,
    filterSubjectId: draft.number.trim(),
    filterSource: draft.filterSource,
    peopleIds: draft.peopleIds,
  };
}

export function AuditPage() {
  const styles = useStyles();
  const { role } = useUserRole();
  const isAdmin = role === "Admin";

  const [filterDraft, setFilterDraft] = useState(defaultAuditDraft);
  const [applied, setApplied] = useState<AppliedFilters>(() => draftToApplied(defaultAuditDraft()));

  const auditQueryKey = useMemo(
    () => [
      "audit-events",
      applied.dateFrom,
      applied.dateTo,
      applied.filterEvent,
      applied.filterTable,
      applied.filterSubjectId,
      applied.filterSource,
      applied.peopleIds.join(","),
    ],
    [applied],
  );

  const auditFetcher = useCallback(async (params: GridFetchParams): Promise<{ rows: AuditRow[]; totalCount: number }> => {
    const filter = buildAuditFilter(applied);

    const SORT_FIELD: Record<string, string> = {
      createdOn:    "createdon",
      eventLabel:   "enmax_acdnevent",
      subjectTable: "enmax_acdnsubjecttable",
      subjectId:    "enmax_acdnsubjectid",
      sourceLabel:  "enmax_acdnsource",
    };
    const sortField = params.sort && SORT_FIELD[params.sort.column];
    const orderBy = sortField
      ? [`${sortField} ${params.sort!.direction}`]
      : ["createdon desc"];

    const result = await Enmax_autocadauditeventsService.getAll({
      filter,
      select:  [
        "enmax_autocadauditeventid", "createdon", "enmax_acdnevent", "enmax_acdnsource",
        "enmax_acdnsubjecttable", "enmax_acdnsubjectid", "enmax_acdnfromstate", "enmax_acdntostate",
        "enmax_acdnreason", "_enmax_acdnactedby_value", "_enmax_acdnactedonbehalfof_value",
      ],
      orderBy,
      top:     MAX_AUDIT_ROWS,
    });
    if (!result.success) {
      logDataverseError("Audit", result.error, `filter: ${filter}`);
      throw new Error("Audit fetch failed");
    }
    const allRows = (result.data ?? []).map(r => toAuditRow(r as AuditRaw));
    return clientPage(allRows, params);
  }, [applied]);

  async function handleExport() {
    await exportToCsv(
      AUDIT_COLS,
      params => auditFetcher({ ...params, page: 0, pageSize: 10000 }),
      { search: "", filters: {}, sort: null, page: 0, pageSize: 10000 },
      10000,
      "audit-export.csv",
    );
  }

  function handleQuery() {
    setApplied(draftToApplied(filterDraft));
  }

  function clearFilters() {
    const cleared = defaultAuditDraft();
    setFilterDraft(cleared);
    setApplied(draftToApplied(cleared));
  }

  return (
    <div className={styles.root}>
      <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM }}>
        <Title2 as="h1">Audit Log</Title2>
        <div className={styles.spacer} />
        {isAdmin && (
          <Button icon={<ArrowDownloadRegular />} onClick={() => void handleExport()}>Export CSV</Button>
        )}
      </div>

      <GridQueryFilterBar
        numberLabel="Subject ID"
        numberPlaceholder="GUID or identifier"
        draft={{ number: filterDraft.number, from: filterDraft.from, to: filterDraft.to }}
        onDraftChange={(patch) => setFilterDraft((prev) => ({ ...prev, ...patch }))}
        onQuery={handleQuery}
        onClear={clearFilters}
        personLabel="Acted by"
        peopleIds={filterDraft.peopleIds}
        onPeopleChange={(ids) => setFilterDraft((prev) => ({ ...prev, peopleIds: ids }))}
        extraFields={(
          <>
            <Field label="Event">
              <Select value={filterDraft.filterEvent} onChange={(_, d) => setFilterDraft((prev) => ({ ...prev, filterEvent: d.value }))} aria-label="Filter by event">
                <option value="">All events</option>
                {Object.entries(EVENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Subject Table">
              <Select value={filterDraft.filterTable} onChange={(_, d) => setFilterDraft((prev) => ({ ...prev, filterTable: d.value }))} aria-label="Filter by subject table">
                <option value="">All tables</option>
                <option value="enmax_autocaddrawing">Drawing</option>
                <option value="enmax_autocadcheckout">Checkout</option>
                <option value="enmax_autocadreservation">Reservation</option>
                <option value="enmax_autocadbusiness">Business</option>
                <option value="enmax_autocadasset">Asset</option>
                <option value="enmax_autocadunit">Unit</option>
                <option value="enmax_autocaddomain">Domain</option>
                <option value="enmax_autocadsystem">System</option>
                <option value="enmax_autocadkind">Kind</option>
                <option value="enmax_autocadrecordtype">Record Type</option>
                <option value="enmax_autocadrecordphase">Record Phase</option>
                <option value="enmax_autocadvendor">Vendor</option>
              </Select>
            </Field>
            <Field label="Source">
              <Select value={filterDraft.filterSource} onChange={(_, d) => setFilterDraft((prev) => ({ ...prev, filterSource: d.value }))} aria-label="Filter by source">
                <option value="">All sources</option>
                {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </>
        )}
      />

      <div className={styles.grid}>
        <EnmaxDataGrid
          queryKey={auditQueryKey}
          fetcher={auditFetcher}
          columns={AUDIT_COLS}
          rowKey={r => r.id}
          enableExport={false}
          enableColumnVisibility
          enableQuickSearch={false}
          defaultSort={{ column: "createdOn", direction: "desc" }}
          emptyMessage="No audit events in selected range."
          errorMessage="Failed to load audit events."
        />
      </div>
    </div>
  );
}
