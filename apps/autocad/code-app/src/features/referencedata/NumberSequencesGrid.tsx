import { useCallback, useMemo, useState } from "react";
import { Badge, Text, tokens } from "@fluentui/react-components";
import { EnmaxDataGrid, GridQueryFilterBar, dateTimeColumn } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import { pagedGetAllOptions, pagedResult } from "../../components/DataGrid/serverPaging";
import { logDataverseError } from "../../components/DataGrid/dataverseError";
import { Enmax_autocadnumbersequencesService } from "../../generated";

const SEQ_STATUS: Record<number, { label: string; color: "success" | "warning" | "danger" | undefined }> = {
  1: { label: "Healthy",   color: "success"  },
  2: { label: "Warning",   color: "warning"  },
  3: { label: "Critical",  color: "danger"   },
  4: { label: "Exhausted", color: undefined  },
};

type RawSeq = {
  enmax_autocadnumbersequenceid: string;
  enmax_acdnsequencekey?: string;
  enmax_acdnstatus?: number;
  enmax_acdnlastissued?: number;
  enmax_acdnlastissuedat?: string;
  enmax_acdnseedvalue?: number;
  enmax_acdnseedreason?: string;
  "_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnasset_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnunit_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdndomain_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnsystem_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnkind_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnseededby_value@OData.Community.Display.V1.FormattedValue"?: string;
};

const COLUMNS: ColumnDef<RawSeq>[] = [
  {
    id: "enmax_acdnsequencekey", header: "Sequence Key",
    accessor: r => r.enmax_acdnsequencekey ?? "",
    sortable: true,
    cell: r => <Text weight="semibold" size={200}>{r.enmax_acdnsequencekey}</Text>,
  },
  { id: "business", header: "Business", accessor: r => r["_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue"] ?? "", sortable: true },
  { id: "asset",    header: "Asset",    accessor: r => r["_enmax_acdnasset_value@OData.Community.Display.V1.FormattedValue"] ?? "",    sortable: true },
  { id: "unit",     header: "Unit",     accessor: r => r["_enmax_acdnunit_value@OData.Community.Display.V1.FormattedValue"] ?? "",     sortable: true },
  { id: "domain",   header: "Domain",   accessor: r => r["_enmax_acdndomain_value@OData.Community.Display.V1.FormattedValue"] ?? "",   sortable: true },
  { id: "system",   header: "System",   accessor: r => r["_enmax_acdnsystem_value@OData.Community.Display.V1.FormattedValue"] ?? "",   sortable: true },
  { id: "kind",     header: "Kind",     accessor: r => r["_enmax_acdnkind_value@OData.Community.Display.V1.FormattedValue"] ?? "",     sortable: true },
  { id: "enmax_acdnseedvalue",  header: "Seed Value",   accessor: r => r.enmax_acdnseedvalue ?? 0,  sortable: true },
  { id: "enmax_acdnlastissued", header: "Last Issued",  accessor: r => r.enmax_acdnlastissued ?? 0, sortable: true },
  {
    id: "remaining", header: "Remaining",
    accessor: r => 9999 - (r.enmax_acdnlastissued ?? 0),
    sortable: true,
    cell: r => {
      const n = 9999 - (r.enmax_acdnlastissued ?? 0);
      return <Text style={{ color: n < 100 ? tokens.colorPaletteRedForeground1 : undefined }}>{n}</Text>;
    },
  },
  {
    id: "enmax_acdnstatus", header: "Status",
    accessor: r => r.enmax_acdnstatus ?? 1,
    sortable: true,
    cell: r => {
      const info = SEQ_STATUS[r.enmax_acdnstatus ?? 1] ?? { label: String(r.enmax_acdnstatus ?? 1), color: undefined };
      return <Badge appearance="tint" color={info.color}>{info.label}</Badge>;
    },
  },
  dateTimeColumn<RawSeq>({
    id: "enmax_acdnlastissuedat",
    header: "Last Issued At",
    accessor: r => r.enmax_acdnlastissuedat,
  }),
  { id: "seededby",           header: "Seeded By",    accessor: r => r["_enmax_acdnseededby_value@OData.Community.Display.V1.FormattedValue"] ?? "", sortable: true },
  { id: "enmax_acdnseedreason", header: "Seed Reason", accessor: r => r.enmax_acdnseedreason ?? "", visibleByDefault: false },
];

const ALLOWED_SORT_COLS = new Set([
  "enmax_acdnsequencekey", "enmax_acdnseedvalue", "enmax_acdnlastissued",
  "enmax_acdnstatus", "enmax_acdnlastissuedat",
]);

function buildFilter(search: string): string {
  if (!search) return "";
  const q = search.replace(/'/g, "''");
  return `contains(enmax_acdnsequencekey,'${q}')`;
}

function buildOrderBy(params: GridFetchParams): string[] {
  if (params.sort?.column === "remaining") {
    return [`enmax_acdnlastissued ${params.sort.direction === "asc" ? "desc" : "asc"}`];
  }
  if (params.sort && ALLOWED_SORT_COLS.has(params.sort.column)) {
    return [`${params.sort.column} ${params.sort.direction === "desc" ? "desc" : "asc"}`];
  }
  return ["enmax_acdnstatus asc"];
}

async function fetchSequences(search: string, params: GridFetchParams): Promise<{ rows: RawSeq[]; totalCount: number; skipToken?: string }> {
  const filter = buildFilter(search);
  const options = pagedGetAllOptions(params, {
    filter: filter || undefined,
    select: [
      "enmax_autocadnumbersequenceid", "enmax_acdnsequencekey", "enmax_acdnstatus",
      "enmax_acdnlastissued", "enmax_acdnlastissuedat", "enmax_acdnseedvalue", "enmax_acdnseedreason",
      "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
      "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value", "_enmax_acdnseededby_value",
    ],
    orderBy: buildOrderBy(params),
  });
  const r = await Enmax_autocadnumbersequencesService.getAll(options);
  if (!r.success) {
    logDataverseError("ReferenceData/NumberSequences", r.error);
    throw new Error("Failed to fetch number sequences");
  }
  return pagedResult(r, (r.data ?? []) as RawSeq[]);
}

export function NumberSequencesGrid() {
  const [filterDraft, setFilterDraft] = useState({ number: "", from: "", to: "" });
  const [appliedSearch, setAppliedSearch] = useState("");

  const fetcher = useCallback(
    (params: GridFetchParams) => fetchSequences(appliedSearch, params),
    [appliedSearch],
  );

  const queryKey = useMemo(() => ["number-sequences-grid", appliedSearch], [appliedSearch]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <GridQueryFilterBar
        numberLabel="Sequence key"
        numberPlaceholder="Search by sequence key…"
        draft={{ number: filterDraft.number, from: filterDraft.from, to: filterDraft.to }}
        onDraftChange={(patch) => setFilterDraft((prev) => ({ ...prev, ...patch }))}
        onQuery={() => setAppliedSearch(filterDraft.number.trim())}
        onClear={() => {
          setFilterDraft({ number: "", from: "", to: "" });
          setAppliedSearch("");
        }}
        showDateRange={false}
      />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <EnmaxDataGrid
          queryKey={queryKey}
          fetcher={fetcher}
          columns={COLUMNS}
          rowKey={r => r.enmax_autocadnumbersequenceid}
          enableColumnVisibility
          enableQuickSearch={false}
          defaultSort={{ column: "enmax_acdnstatus", direction: "asc" }}
          emptyMessage="No number sequences found."
        />
      </div>
    </div>
  );
}
