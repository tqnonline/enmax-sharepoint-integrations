import { useState, useCallback } from "react";
import {
  Badge,
  Button,
  Field,
  Input,
  Select,
  Text,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, FilterDismissRegular, SearchRegular } from "@fluentui/react-icons";
import { Enmax_autocadauditeventsService } from "../../generated";
import { useUserRole } from "../../auth/useUserRole";
import { exportToCsv } from "../../components/DataGrid/csvExport";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import { auditEventColor } from "./auditPills";
import { buildAuditFilter, type AppliedFilters } from "./auditFilter";
import { logDataverseError } from "../../components/DataGrid/dataverseError";

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

const DEFAULT_DAYS = 7;
// Dataverse caps a single page at 5000 rows; the date filter keeps the window small.
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
  "_enmax_acdnactedby_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnactedonbehalfof_value@OData.Community.Display.V1.FormattedValue"?: string;
};

function toDate(s: string) { return s ? new Date(s).toLocaleDateString() + " " + new Date(s).toLocaleTimeString() : ""; }

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
    actedBy:         r["_enmax_acdnactedby_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    actedOnBehalfOf: r["_enmax_acdnactedonbehalfof_value@OData.Community.Display.V1.FormattedValue"] ?? "",
  };
}

const AUDIT_COLS: ColumnDef<AuditRow>[] = [
  { id: "createdOn",       header: "Acted On",      accessor: r => r.createdOn,                          sortable: true, cell: r => <Text size={200}>{toDate(r.createdOn)}</Text>, exportFormatter: v => toDate(String(v)) },
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
  filters: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalM, alignItems: "flex-end" },
  spacer:  { flex: 1 },
  grid:    { flex: 1, overflow: "hidden" },
});

export function AuditPage() {
  const styles = useStyles();
  const { role } = useUserRole();
  const isAdmin = role === "Admin";

  const today = new Date();
  const defaultFrom = new Date(today.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const defaultTo   = today.toISOString().slice(0, 10);

  const [dateFrom,        setDateFrom]        = useState(defaultFrom);
  const [dateTo,          setDateTo]          = useState(defaultTo);
  const [filterEvent,     setFilterEvent]     = useState("");
  const [filterTable,     setFilterTable]     = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterSource,    setFilterSource]    = useState("");

  const [applied, setApplied] = useState<AppliedFilters>({
    dateFrom:        defaultFrom,
    dateTo:          defaultTo,
    filterEvent:     "",
    filterTable:     "",
    filterSubjectId: "",
    filterSource:    "",
  });

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

    // Dataverse rejects $skip ("Skip Clause is not supported in CRM"), so we cannot
    // page server-side here. Fetch the (date-bounded) window in one request and page
    // client-side — same approach as Reference Data / My Items.
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
    const totalCount = allRows.length;
    const start = params.page * params.pageSize;
    const rows = allRows.slice(start, start + params.pageSize);

    return { rows, totalCount };
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

  function clearFilters() {
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
    setFilterEvent("");
    setFilterTable("");
    setFilterSubjectId("");
    setFilterSource("");
    setApplied({
      dateFrom:        defaultFrom,
      dateTo:          defaultTo,
      filterEvent:     "",
      filterTable:     "",
      filterSubjectId: "",
      filterSource:    "",
    });
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

      <div className={styles.filters} role="search" aria-label="Audit filters">
        <Field label="From date">
          <Input type="date" value={dateFrom} onChange={(_, d) => setDateFrom(d.value)} aria-label="From date" />
        </Field>
        <Field label="To date">
          <Input type="date" value={dateTo} onChange={(_, d) => setDateTo(d.value)} aria-label="To date" />
        </Field>
        <Field label="Event">
          <Select value={filterEvent} onChange={(_, d) => setFilterEvent(d.value)} aria-label="Filter by event">
            <option value="">All events</option>
            {Object.entries(EVENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Subject Table">
          <Select value={filterTable} onChange={(_, d) => setFilterTable(d.value)} aria-label="Filter by subject table">
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
        <Field label="Subject ID">
          <Input value={filterSubjectId} onChange={(_, d) => setFilterSubjectId(d.value)} placeholder="GUID" aria-label="Filter by subject ID" />
        </Field>
        <Field label="Source">
          <Select value={filterSource} onChange={(_, d) => setFilterSource(d.value)} aria-label="Filter by source">
            <option value="">All sources</option>
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Button
          appearance="primary"
          icon={<SearchRegular />}
          onClick={() => setApplied({ dateFrom, dateTo, filterEvent, filterTable, filterSubjectId, filterSource })}
        >
          Query
        </Button>
        <Button appearance="subtle" icon={<FilterDismissRegular />} onClick={clearFilters} aria-label="Clear filters">Clear</Button>
      </div>

      <div className={styles.grid}>
        <EnmaxDataGrid
          queryKey={["audit-events", applied.dateFrom, applied.dateTo, applied.filterEvent, applied.filterTable, applied.filterSubjectId, applied.filterSource]}
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
