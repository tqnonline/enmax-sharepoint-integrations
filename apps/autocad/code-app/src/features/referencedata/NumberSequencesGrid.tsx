import { Badge, Text, tokens } from "@fluentui/react-components";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
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

type SeqColId = "enmax_acdnsequencekey" | "business" | "asset" | "unit" | "domain" | "system" | "kind"
  | "enmax_acdnseedvalue" | "enmax_acdnlastissued" | "remaining" | "enmax_acdnstatus"
  | "enmax_acdnlastissuedat" | "seededby" | "enmax_acdnseedreason";

function getSeqVal(s: RawSeq, col: SeqColId): unknown {
  switch (col) {
    case "remaining":  return 9999 - (s.enmax_acdnlastissued ?? 0);
    case "business":   return s["_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue"] ?? "";
    case "asset":      return s["_enmax_acdnasset_value@OData.Community.Display.V1.FormattedValue"] ?? "";
    case "unit":       return s["_enmax_acdnunit_value@OData.Community.Display.V1.FormattedValue"] ?? "";
    case "domain":     return s["_enmax_acdndomain_value@OData.Community.Display.V1.FormattedValue"] ?? "";
    case "system":     return s["_enmax_acdnsystem_value@OData.Community.Display.V1.FormattedValue"] ?? "";
    case "kind":       return s["_enmax_acdnkind_value@OData.Community.Display.V1.FormattedValue"] ?? "";
    case "seededby":   return s["_enmax_acdnseededby_value@OData.Community.Display.V1.FormattedValue"] ?? "";
    default:           return (s as Record<string, unknown>)[col] ?? 0;
  }
}

const COLUMNS: ColumnDef<RawSeq>[] = [
  {
    id: "enmax_acdnsequencekey", header: "Sequence Key",
    accessor: r => r.enmax_acdnsequencekey ?? "",
    sortable: true, filterable: true,
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
    sortable: true, filterable: true, filterType: "select",
    filterOptions: [
      { value: "1", label: "Healthy" },
      { value: "2", label: "Warning" },
      { value: "3", label: "Critical" },
      { value: "4", label: "Exhausted" },
    ],
    cell: r => {
      const info = SEQ_STATUS[r.enmax_acdnstatus ?? 1] ?? { label: String(r.enmax_acdnstatus ?? 1), color: undefined };
      return <Badge appearance="tint" color={info.color}>{info.label}</Badge>;
    },
  },
  {
    id: "enmax_acdnlastissuedat", header: "Last Issued At",
    accessor: r => r.enmax_acdnlastissuedat ?? "",
    sortable: true,
    cell: r => <>{r.enmax_acdnlastissuedat ? new Date(r.enmax_acdnlastissuedat).toLocaleDateString() : ""}</>,
  },
  { id: "seededby",           header: "Seeded By",    accessor: r => r["_enmax_acdnseededby_value@OData.Community.Display.V1.FormattedValue"] ?? "", sortable: true },
  { id: "enmax_acdnseedreason", header: "Seed Reason", accessor: r => r.enmax_acdnseedreason ?? "", visibleByDefault: false },
];

async function fetchSequences(params: GridFetchParams): Promise<{ rows: RawSeq[]; totalCount: number }> {
  const r = await Enmax_autocadnumbersequencesService.getAll({
    select: [
      "enmax_autocadnumbersequenceid", "enmax_acdnsequencekey", "enmax_acdnstatus",
      "enmax_acdnlastissued", "enmax_acdnlastissuedat", "enmax_acdnseedvalue", "enmax_acdnseedreason",
      "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
      "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value", "_enmax_acdnseededby_value",
    ],
  });
  if (!r.success) throw new Error("Failed to fetch number sequences");
  let rows = (r.data ?? []) as RawSeq[];

  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter(s =>
      (s.enmax_acdnsequencekey ?? "").toLowerCase().includes(q) ||
      (s["_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue"] ?? "").toLowerCase().includes(q) ||
      (s["_enmax_acdnasset_value@OData.Community.Display.V1.FormattedValue"] ?? "").toLowerCase().includes(q) ||
      (s["_enmax_acdnunit_value@OData.Community.Display.V1.FormattedValue"] ?? "").toLowerCase().includes(q),
    );
  }

  const statusFilter = params.filters["enmax_acdnstatus"];
  const statusStr = Array.isArray(statusFilter) ? statusFilter[0] : statusFilter;
  if (statusStr) {
    const n = Number(statusStr);
    rows = rows.filter(s => (s.enmax_acdnstatus ?? 1) === n);
  }

  if (params.sort) {
    const col = params.sort.column as SeqColId;
    const dir = params.sort.direction;
    rows = [...rows].sort((a, b) => {
      const av = getSeqVal(a, col);
      const bv = getSeqVal(b, col);
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return dir === "asc" ? cmp : -cmp;
    });
  }

  const totalCount = rows.length;
  const start = params.page * params.pageSize;
  return { rows: rows.slice(start, start + params.pageSize), totalCount };
}

export function NumberSequencesGrid() {
  // Number Sequences are read-only in the app (view/search/filter). Seed values are
  // preloaded via scripting (solution/seed + seed scripts); the CSV import was retired
  // 2026-06-01 to remove manual bulk-load work from the Document Controller.
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <EnmaxDataGrid
          queryKey={["number-sequences-grid"]}
          fetcher={fetchSequences}
          columns={COLUMNS}
          rowKey={r => r.enmax_autocadnumbersequenceid}
          enableColumnVisibility
          defaultSort={{ column: "enmax_acdnstatus", direction: "asc" }}
          quickSearchPlaceholder="Search sequences…"
          emptyMessage="No number sequences found."
        />
      </div>
    </div>
  );
}
