import { fetchSearchReservations } from "../../features/search/useUnifiedSearch";
import { Enmax_autocadreservationsService } from "../../generated/services/Enmax_autocadreservationsService";
import type { GridFetchParams } from "../../components/DataGrid";

vi.mock("../../generated/services/Enmax_autocadreservationsService", () => ({
  Enmax_autocadreservationsService: { getAll: vi.fn() },
}));

const getAll = vi.mocked(Enmax_autocadreservationsService.getAll);

const params: GridFetchParams = {
  search: "",
  filters: {},
  sort: null,
  page: 0,
  pageSize: 10,
};

afterEach(() => vi.clearAllMocks());

// $count wiring: the fetcher must request OData $count and use the returned total,
// so pagination is accurate beyond the current page (not just rows.length).
test("requests count:true and uses result.count as totalCount", async () => {
  getAll.mockResolvedValue({
    success: true,
    data: [{ enmax_autocadreservationid: "r1", enmax_acdnreservationid: "RES-1", enmax_acdnstatus: 1 }],
    count: 42,
  } as Awaited<ReturnType<typeof Enmax_autocadreservationsService.getAll>>);

  const result = await fetchSearchReservations(params);

  // Server paging: count + maxPageSize, and NEVER $skip (Dataverse rejects it).
  expect(getAll).toHaveBeenCalledWith(expect.objectContaining({ count: true, maxPageSize: 10 }));
  expect(getAll.mock.calls[0][0]).not.toHaveProperty("skip");
  expect(result.totalCount).toBe(42);
  expect(result.rows).toHaveLength(1);
});

// The grid supplies the page's skipToken; the fetcher forwards it and returns the next one.
test("forwards skipToken and returns the next page cookie", async () => {
  getAll.mockResolvedValue({
    success: true,
    data: [],
    count: 42,
    skipToken: "NEXT_TOKEN",
  } as Awaited<ReturnType<typeof Enmax_autocadreservationsService.getAll>>);

  const result = await fetchSearchReservations({ ...params, page: 1, skipToken: "TOKEN_FOR_P1" });

  expect(getAll).toHaveBeenCalledWith(expect.objectContaining({ skipToken: "TOKEN_FOR_P1" }));
  expect(result.skipToken).toBe("NEXT_TOKEN");
});

// Falls back to rows.length when the server omits @odata.count.
test("falls back to rows.length when count is absent", async () => {
  getAll.mockResolvedValue({
    success: true,
    data: [{ enmax_autocadreservationid: "r1", enmax_acdnreservationid: "RES-1" }],
  } as Awaited<ReturnType<typeof Enmax_autocadreservationsService.getAll>>);

  const result = await fetchSearchReservations(params);
  expect(result.totalCount).toBe(1);
});
