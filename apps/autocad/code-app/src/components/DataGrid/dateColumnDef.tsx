import type { ColumnDef } from "./types";
import { exportDateLocale, exportDateTimeLocale, formatGridDate, formatGridDateTime } from "../../lib/formatDateTime";

type DateColumnOpts<T> = Omit<Partial<ColumnDef<T>>, "accessor"> & {
  id: string;
  header: string;
  accessor: (row: T) => string | null | undefined;
};

/** Standard locale datetime column for EnmaxDataGrid (no relative "X ago" text). */
export function dateTimeColumn<T>(opts: DateColumnOpts<T>): ColumnDef<T> {
  const { accessor, ...rest } = opts;
  return {
    sortable: true,
    width: 160,
    cell: (r) => <>{formatGridDateTime(accessor(r))}</>,
    exportFormatter: exportDateTimeLocale,
    ...rest,
    accessor: (r) => accessor(r) ?? "",
  };
}

/** Standard locale date-only column for EnmaxDataGrid. */
export function dateColumn<T>(opts: DateColumnOpts<T>): ColumnDef<T> {
  const { accessor, ...rest } = opts;
  return {
    sortable: true,
    width: 130,
    cell: (r) => <>{formatGridDate(accessor(r))}</>,
    exportFormatter: exportDateLocale,
    ...rest,
    accessor: (r) => accessor(r) ?? "",
  };
}

export { formatGridDate, formatGridDateTime, exportDateLocale, exportDateTimeLocale };
