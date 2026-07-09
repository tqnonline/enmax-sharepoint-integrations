import { Link, Text, tokens } from "@fluentui/react-components";
import type { ColumnDef } from "./types";

/** Prefer drop-off library URL, then destination. */
export function sharePointUrlFrom(libraryUrl?: string, destinationUrl?: string): string {
  return libraryUrl?.trim() || destinationUrl?.trim() || "";
}

/**
 * Prominent SharePoint link column — placed immediately after the primary identifier
 * in document/drawing grids so users can jump to the library in one click.
 */
export function sharePointColumn<T>(
  accessor: (row: T) => string,
  opts?: Partial<ColumnDef<T>>,
): ColumnDef<T> {
  return {
    id: "sharePointUrl",
    header: "SharePoint",
    accessor,
    sortable: false,
    width: 180,
    cell: (row) => {
      const url = accessor(row);
      if (!/^https?:\/\//i.test(url)) {
        return <Text style={{ color: tokens.colorNeutralForeground3 }}>—</Text>;
      }
      return (
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <Text weight="semibold">Open in SharePoint</Text>
        </Link>
      );
    },
    exportFormatter: (v) => String(v ?? ""),
    ...opts,
  };
}
