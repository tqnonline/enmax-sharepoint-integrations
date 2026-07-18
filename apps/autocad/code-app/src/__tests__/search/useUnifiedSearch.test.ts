import { fetchSearchReservations } from "../../features/search/useUnifiedSearch";
import { Enmax_autocadreservationsService } from "../../generated/services/Enmax_autocadreservationsService";
import { Enmax_autocaddrawingsService } from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";

vi.mock("../../generated/services/Enmax_autocadreservationsService", () => ({
  Enmax_autocadreservationsService: { getAll: vi.fn() },
}));

vi.mock("../../generated", async () => {
  const empty = { success: true, data: [] };
  return {
    Enmax_autocadbusinessesService: { getAll: vi.fn(async () => empty) },
    Enmax_autocadassetsService: { getAll: vi.fn(async () => empty) },
    Enmax_autocadunitsService: { getAll: vi.fn(async () => empty) },
    Enmax_autocaddomainsService: { getAll: vi.fn(async () => empty) },
    Enmax_autocadsystemsService: { getAll: vi.fn(async () => empty) },
    Enmax_autocadkindsService: { getAll: vi.fn(async () => empty) },
    Enmax_autocaddrawingsService: { getAll: vi.fn(async () => empty) },
  };
});

const getAll = vi.mocked(Enmax_autocadreservationsService.getAll);
const drawingsGetAll = vi.mocked(Enmax_autocaddrawingsService.getAll);

const params: GridFetchParams = {
  search: "",
  filters: {},
  sort: null,
  page: 0,
  pageSize: 10,
};

afterEach(() => vi.clearAllMocks());

test("requests count:true and uses result.count as totalCount", async () => {
  getAll.mockResolvedValue({
    success: true,
    data: [{ enmax_autocadreservationid: "r1", enmax_acdnreservationid: "RES-1", enmax_acdnstatus: 1 }],
    count: 42,
  } as Awaited<ReturnType<typeof Enmax_autocadreservationsService.getAll>>);

  const result = await fetchSearchReservations(params);

  expect(getAll).toHaveBeenCalledWith(expect.objectContaining({ count: true, maxPageSize: 10 }));
  expect(getAll.mock.calls[0][0]).not.toHaveProperty("skip");
  expect(result.totalCount).toBe(42);
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]?.displayNumber).not.toMatch(/^RES-/);
});

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

test("falls back to rows.length when count is absent", async () => {
  getAll.mockResolvedValue({
    success: true,
    data: [{ enmax_autocadreservationid: "r1", enmax_acdnreservationid: "RES-1" }],
  } as Awaited<ReturnType<typeof Enmax_autocadreservationsService.getAll>>);

  const result = await fetchSearchReservations(params);
  expect(result.totalCount).toBe(1);
});

test("number search matches issued drawing numbers, not RES-#### autonumber", async () => {
  drawingsGetAll.mockResolvedValue({
    success: true,
    data: [{ _enmax_acdnreservation_value: "r-guid-1" }],
  } as never);

  getAll.mockResolvedValue({
    success: true,
    data: [{
      enmax_autocadreservationid: "r-guid-1",
      enmax_acdnreservationid: "RES-9999",
      enmax_acdnissuednumbers: "[1]",
      enmax_acdnstatus: 2,
    }],
    count: 1,
  } as Awaited<ReturnType<typeof Enmax_autocadreservationsService.getAll>>);

  await fetchSearchReservations({ ...params, search: "GG-CG-00" });

  expect(drawingsGetAll).toHaveBeenCalledWith(expect.objectContaining({
    filter: expect.stringContaining("contains(enmax_acdnnumber,'GG-CG-00')"),
  }));
  const filter = String(getAll.mock.calls[0]?.[0]?.filter ?? "");
  expect(filter).not.toContain("enmax_acdnreservationid");
  expect(filter).toContain("enmax_autocadreservationid eq r-guid-1");
  expect(filter).toContain("contains(enmax_acdnreason,'GG-CG-00')");
});
