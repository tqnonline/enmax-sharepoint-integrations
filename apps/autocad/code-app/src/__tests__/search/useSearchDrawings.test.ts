import { Enmax_autocaddrawingsService } from "../../generated";
import { fetchSearchDrawings } from "../../features/search/useSearchDrawings";

vi.mock("../../generated", () => ({
  Enmax_autocaddrawingsService: { getAll: vi.fn() },
  Enmax_autocadreservationsService: { getAll: vi.fn(async () => ({ success: true, data: [] })) },
}));

const getAll = vi.mocked(Enmax_autocaddrawingsService.getAll);

beforeEach(() => {
  getAll.mockResolvedValue({ success: true, data: [], count: 0 });
});

test("issued date filter uses createdon DateTimeOffset OData literals", async () => {
  await fetchSearchDrawings({
    search: "",
    filters: { dateFrom: "2026-06-09", dateTo: "2026-07-09", documentSubtype: "drawing" },
    sort: null,
    page: 0,
    pageSize: 50,
  });

  const filter = getAll.mock.calls[0]?.[0]?.filter ?? "";
  expect(filter).toContain("createdon ge 2026-06-09T00:00:00Z");
  expect(filter).toContain("createdon le 2026-07-09T23:59:59Z");
  expect(filter).not.toMatch(/createdon ge '2026-06-09/);
  expect(filter).not.toContain("enmax_acdnrevisiondate");
});
