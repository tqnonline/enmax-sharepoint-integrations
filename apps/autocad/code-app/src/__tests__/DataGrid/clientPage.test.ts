import { clientPage } from "../../components/DataGrid/clientPage";
import type { GridFetchParams } from "../../components/DataGrid";

interface Row { code: string; n: number; statecode: number; }
const ROWS: Row[] = [
  { code: "GG", n: 3, statecode: 0 },
  { code: "TX", n: 1, statecode: 1 },
  { code: "DG", n: 2, statecode: 0 },
];
const base: GridFetchParams = { search: "", filters: {}, sort: null, page: 0, pageSize: 10 };

test("filter predicate runs before search and shrinks totalCount", () => {
  const r = clientPage(ROWS, base, { filter: x => x.statecode === 0 });
  expect(r.totalCount).toBe(2);
  expect(r.rows.map(x => x.code)).toEqual(["GG", "DG"]);
});

test("search matches any of the provided fields, case-insensitive", () => {
  const r = clientPage(ROWS, { ...base, search: "tx" }, { searchText: x => [x.code] });
  expect(r.rows).toEqual([{ code: "TX", n: 1, statecode: 1 }]);
});

test("numeric sort uses subtraction; string sort uses localeCompare; direction respected", () => {
  const asc = clientPage(ROWS, { ...base, sort: { column: "n", direction: "asc" } });
  expect(asc.rows.map(x => x.n)).toEqual([1, 2, 3]);
  const desc = clientPage(ROWS, { ...base, sort: { column: "code", direction: "desc" } });
  expect(desc.rows.map(x => x.code)).toEqual(["TX", "GG", "DG"]);
});

test("slices to the requested page and reports full total", () => {
  const r = clientPage(ROWS, { ...base, pageSize: 2, page: 1 });
  expect(r.totalCount).toBe(3);
  expect(r.rows).toHaveLength(1);
});
