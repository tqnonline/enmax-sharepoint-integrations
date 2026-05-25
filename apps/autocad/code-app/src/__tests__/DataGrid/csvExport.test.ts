import { exportToCsv } from "../../components/DataGrid/csvExport";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";

interface Row { id: string; }
const columns: ColumnDef<Row>[] = [{ id: "id", header: "ID", accessor: r => r.id }];
const params: GridFetchParams = { search: "", filters: {}, sort: null, page: 0, pageSize: 50 };

beforeEach(() => {
  // jsdom has no object-URL impl; stub so the download path doesn't throw.
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => "blob:x");
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

// Regression: server-paged fetchers ignore `page` and page off skipToken (Dataverse
// rejects $skip). Export must thread the cookie forward, not re-request page 0.
test("threads skipToken across pages for server-paged fetchers", async () => {
  const page1 = Array.from({ length: 500 }, (_, i) => ({ id: `p1-${i}` }));
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ rows: page1, totalCount: 501, skipToken: "TOKEN_1" })
    .mockResolvedValueOnce({ rows: [{ id: "p2-0" }], totalCount: 501, skipToken: undefined });

  await exportToCsv(columns, fetcher, params, 10000, "x.csv");

  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][0].skipToken).toBeUndefined();
  expect(fetcher.mock.calls[1][0].skipToken).toBe("TOKEN_1"); // cookie forwarded, no page-0 re-fetch
});

// Client-side fetchers return no skipToken and page by number — export still walks pages.
test("falls back to page increment when no skipToken is returned", async () => {
  const page1 = Array.from({ length: 500 }, (_, i) => ({ id: `c1-${i}` }));
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ rows: page1, totalCount: 501 })
    .mockResolvedValueOnce({ rows: [{ id: "c2-0" }], totalCount: 501 });

  await exportToCsv(columns, fetcher, params, 10000, "x.csv");

  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][0].page).toBe(0);
  expect(fetcher.mock.calls[1][0].page).toBe(1);
  expect(fetcher.mock.calls[1][0].skipToken).toBeUndefined();
});
