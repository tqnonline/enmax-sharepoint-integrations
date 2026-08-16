import { Persona } from "@fluentui/react-components";
import type { ColumnDef } from "./types";

export interface PeopleRow {
  submittedById?: string;
  submittedByName?: string;
  approvedById?: string;
  approvedByName?: string;
}

export function submittedByColumn<T extends PeopleRow>(
  opts?: Partial<ColumnDef<T>>,
): ColumnDef<T> {
  return {
    id: "submittedBy",
    header: "Submitted By",
    accessor: r => r.submittedByName ?? "",
    sortable: true,
    filterable: false,
    cell: r => <Persona name={r.submittedByName || "—"} size="small" />,
    exportFormatter: v => String(v ?? ""),
    ...opts,
  };
}

export function approvedByColumn<T extends PeopleRow>(
  opts?: Partial<ColumnDef<T>>,
): ColumnDef<T> {
  return {
    id: "approvedBy",
    header: "Approved By",
    accessor: r => r.approvedByName ?? "",
    sortable: true,
    filterable: false,
    cell: r => <Persona name={r.approvedByName || "—"} size="small" />,
    exportFormatter: v => String(v ?? ""),
    ...opts,
  };
}

/** filterIds map entries for submittedBy / approvedBy columns. */
export const peopleFilterIds = {
  submittedBy: <T extends PeopleRow>(r: T) => r.submittedById ?? "",
  approvedBy:  <T extends PeopleRow>(r: T) => r.approvedById ?? "",
};
