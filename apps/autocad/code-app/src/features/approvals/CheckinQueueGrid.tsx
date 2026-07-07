import { useCallback, useMemo, useState } from "react";
import {
  Persona, Text, Badge, Input, Field, Button, Tag, Avatar, Link,
  TagPicker, TagPickerControl, TagPickerGroup, TagPickerInput, TagPickerList, TagPickerOption,
  tokens, makeStyles,
} from "@fluentui/react-components";
import type { TagPickerProps, BadgeProps } from "@fluentui/react-components";
import { SearchRegular, FilterDismissRegular } from "@fluentui/react-icons";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { usePageSize } from "../../config/usePageSize";
import { useAppConfig } from "../../config/useAppConfig";
import { ValidationDrawer } from "../checkout/components/ValidationDrawer";
import { DrawingState } from "../checkout/api/checkoutClient";
import { CHECKIN_STATUS_AWAITING, type CheckinRow } from "./hooks/useCheckins";

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_COLOR: Record<number, BadgeProps["color"]> = {
  1: "informative", // Open
  2: "warning",     // Awaiting Validation
  3: "success",     // Approved
  4: "danger",      // Declined
  5: "subtle",      // Force-Closed
  6: "brand",       // Requested
};

const BASE_COLUMNS: ColumnDef<CheckinRow>[] = [
  {
    id: "drawingNumber", header: "Drawing/Document Number", accessor: (r) => r.drawingNumber, sortable: true,
    cell: (r) => <Text style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.drawingNumber || "—"}</Text>,
  },
  {
    id: "submittedByName", header: "Submitted by", accessor: (r) => r.submittedByName, sortable: true,
    cell: (r) => <Persona name={r.submittedByName || "Unknown"} size="small" />,
  },
  {
    id: "submissionInfo", header: "Submission", accessor: (r) => r.submissionInfo, sortable: false, width: 220,
    cell: (r) => (
      <Text title={r.submissionInfo} style={{ display: "block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {r.submissionInfo || "—"}
      </Text>
    ),
  },
  {
    id: "submittedOn", header: "Submitted", accessor: (r) => r.submittedOn, sortable: true, width: 150,
    cell: (r) => <>{fmtDate(r.submittedOn)}</>,
  },
  {
    id: "statusLabel", header: "Status", accessor: (r) => r.statusLabel, sortable: true, width: 150,
    cell: (r) => <Badge appearance="filled" color={STATUS_COLOR[r.status] ?? "informative"}>{r.statusLabel}</Badge>,
  },
];

const useStyles = makeStyles({
  filters: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    alignItems: "flex-end",
    marginBottom: tokens.spacingVerticalS,
    flexWrap: "wrap",
  },
  picker: { minWidth: "240px" },
});

interface Props {
  checkins: CheckinRow[];
}

interface Applied {
  from: string;
  to: string;
  submittedBy: string[];
  number: string;
}

export function CheckinQueueGrid({ checkins }: Props) {
  const styles = useStyles();
  const pageSize = usePageSize();
  // Single SharePoint drop-off library (one library for all drawings, sourced from
  // App Config — same URL the user uploads to in SubmitRevisionDrawer). Per-asset-unit
  // libraries are a future phase; CheckinRow.spLibraryUrl stays plumbed but dormant.
  const { CheckInUploadLibraryUrl } = useAppConfig();

  const columns = useMemo<ColumnDef<CheckinRow>[]>(
    () => [
      ...BASE_COLUMNS,
      {
        id: "actions", header: "Actions", accessor: () => "", width: 190,
        cell: (r) =>
          r.status === CHECKIN_STATUS_AWAITING ? (
            <ValidationDrawer
              checkout={{ id: r.checkoutId, checkedOutBy: r.submittedById, checkedOutOn: r.submittedOn, submissionInfo: r.submissionInfo, newPdfUrls: r.newPdfUrls }}
              drawing={{ id: r.drawingId, state: DrawingState.AwaitingValidation, number: r.drawingNumber, currentRevision: r.currentRevision, missingSheets: r.missingSheets, spLibraryUrl: r.spLibraryUrl }}
            />
          ) : CheckInUploadLibraryUrl ? (
            <Link href={CheckInUploadLibraryUrl} target="_blank" rel="noreferrer">View in SharePoint</Link>
          ) : (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>—</Text>
          ),
      },
    ],
    [CheckInUploadLibraryUrl],
  );

  // Default window = last 7 days (same as the Audit page); the From/To inputs are
  // pre-populated. The source is ALL check-ins (any status) — widen the dates or
  // Clear to see older ones.
  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const defaultTo = today.toISOString().slice(0, 10);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [selectedSubmitters, setSelectedSubmitters] = useState<string[]>([]);
  const [submitterQuery, setSubmitterQuery] = useState("");
  const [numberQuery, setNumberQuery] = useState("");
  const [applied, setApplied] = useState<Applied>({ from: defaultFrom, to: defaultTo, submittedBy: [], number: "" });

  const submitters = useMemo(
    () => [...new Set(checkins.map((c) => c.submittedByName).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [checkins],
  );
  const candidateSubmitters = submitters
    .filter((s) => !selectedSubmitters.includes(s))
    .filter((s) => s.toLowerCase().includes(submitterQuery.toLowerCase()));

  const onSubmitterSelect: TagPickerProps["onOptionSelect"] = (_e, data) => {
    if (data.value === "__none__") return;
    setSelectedSubmitters(data.selectedOptions);
    setSubmitterQuery("");
  };

  const filtered = useMemo(() => {
    const fromMs = applied.from ? new Date(applied.from).getTime() : Number.NEGATIVE_INFINITY;
    const toMs = applied.to ? new Date(applied.to).getTime() + 86_400_000 : Number.POSITIVE_INFINITY; // inclusive end-of-day
    const numberNeedle = applied.number.trim().toLowerCase();
    return checkins.filter((c) => {
      const t = c.submittedOn ? new Date(c.submittedOn).getTime() : 0;
      if (t < fromMs || t > toMs) return false;
      if (applied.submittedBy.length > 0 && !applied.submittedBy.includes(c.submittedByName)) return false;
      if (numberNeedle && !(c.drawingNumber ?? "").toLowerCase().includes(numberNeedle)) return false;
      return true;
    });
  }, [checkins, applied]);

  const fetcher = useCallback(
    async (params: GridFetchParams): Promise<{ rows: CheckinRow[]; totalCount: number }> =>
      clientPage(filtered, params),
    [filtered],
  );

  const queryKey = useMemo(
    () => ["checkin-queue", applied.from, applied.to, applied.submittedBy.join(","), applied.number, filtered.map((c) => c.checkoutId).join(",")],
    [applied, filtered],
  );

  function clearFilters() {
    setFrom(defaultFrom);
    setTo(defaultTo);
    setSelectedSubmitters([]);
    setSubmitterQuery("");
    setNumberQuery("");
    setApplied({ from: defaultFrom, to: defaultTo, submittedBy: [], number: "" });
  }

  return (
    <div style={{ flex: "1 0 auto", minHeight: "500px" }}>
      <div className={styles.filters} role="search" aria-label="Check In filters">
        <Field label="Drawing/Document Number">
          <Input
            value={numberQuery}
            onChange={(_, d) => setNumberQuery(d.value)}
            placeholder="e.g. 01-AA-01-…"
            contentBefore={<SearchRegular />}
            aria-label="Search by Drawing/Document Number"
          />
        </Field>
        <Field label="From date">
          <Input type="date" value={from} onChange={(_, d) => setFrom(d.value)} aria-label="From date" />
        </Field>
        <Field label="To date">
          <Input type="date" value={to} onChange={(_, d) => setTo(d.value)} aria-label="To date" />
        </Field>
        <Field label="Submitted by" className={styles.picker}>
          <TagPicker onOptionSelect={onSubmitterSelect} selectedOptions={selectedSubmitters}>
            <TagPickerControl>
              <TagPickerGroup aria-label="Selected submitters">
                {selectedSubmitters.map((name) => (
                  <Tag key={name} shape="rounded" media={<Avatar aria-hidden name={name} color="colorful" />} value={name}>
                    {name}
                  </Tag>
                ))}
              </TagPickerGroup>
              <TagPickerInput
                aria-label="Filter by submitter"
                placeholder={selectedSubmitters.length ? "" : "Pick a person…"}
                value={submitterQuery}
                onChange={(e) => setSubmitterQuery(e.target.value)}
              />
            </TagPickerControl>
            <TagPickerList>
              {candidateSubmitters.length > 0
                ? candidateSubmitters.map((name) => (
                    <TagPickerOption media={<Avatar shape="square" aria-hidden name={name} color="colorful" />} value={name} key={name}>
                      {name}
                    </TagPickerOption>
                  ))
                : <TagPickerOption value="__none__">No matching submitters</TagPickerOption>}
            </TagPickerList>
          </TagPicker>
        </Field>
        <Button
          appearance="primary"
          icon={<SearchRegular />}
          onClick={() => setApplied({ from, to, submittedBy: selectedSubmitters, number: numberQuery })}
        >
          Query
        </Button>
        <Button appearance="subtle" icon={<FilterDismissRegular />} onClick={clearFilters} aria-label="Clear filters">
          Clear
        </Button>
      </div>
      <EnmaxDataGrid
        queryKey={queryKey}
        fetcher={fetcher}
        columns={columns}
        rowKey={(r) => r.checkoutId}
        enableColumnVisibility
        enableQuickSearch={false}
        exportFileName="check-ins.csv"
        initialPageSize={pageSize}
        defaultSort={{ column: "submittedOn", direction: "desc" }}
        emptyMessage="No Check Ins in selected range."
        errorMessage="Failed to load Check Ins."
      />
    </div>
  );
}
