import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../generated", () => ({
  Enmax_autocadreservationsService: { getAll: vi.fn() },
}));

import { Enmax_autocadreservationsService } from "../../generated";
import { fetchReservationTaxonomyMap, typeLabelForDrawingRow } from "../../lib/drawingTaxonomy";

const mockGetAll = vi.mocked(Enmax_autocadreservationsService.getAll);

beforeEach(() => {
  mockGetAll.mockReset();
});

describe("fetchReservationTaxonomyMap", () => {
  it("returns an empty map without querying when there are no valid GUIDs", async () => {
    const map = await fetchReservationTaxonomyMap(["not-a-guid", ""]);
    expect(map.size).toBe(0);
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it("de-dupes ids and batches a single OData query", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    mockGetAll.mockResolvedValue({
      success: true,
      data: [{
        enmax_autocadreservationid: id,
        enmax_acdnreservationtype: 2,
        enmax_acdndocumentsubtype: 3,
      }],
    });

    const map = await fetchReservationTaxonomyMap([id, id]);

    expect(mockGetAll).toHaveBeenCalledTimes(1);
    const arg = mockGetAll.mock.calls[0][0] as { filter: string };
    expect(arg.filter).toBe(`(enmax_autocadreservationid eq '${id}')`);
    expect(map.get(id)).toEqual({
      enmax_acdnreservationtype: 2,
      enmax_acdndocumentsubtype: 3,
    });
  });

  it("returns an empty map when the service call fails", async () => {
    mockGetAll.mockResolvedValue({ success: false, data: undefined });
    const map = await fetchReservationTaxonomyMap(["22222222-2222-2222-2222-222222222222"]);
    expect(map.size).toBe(0);
  });
});

describe("typeLabelForDrawingRow", () => {
  it("uses the drawing's own taxonomy when present", () => {
    const label = typeLabelForDrawingRow(
      { enmax_acdnreservationtype: 2, enmax_acdndocumentsubtype: 4 },
      new Map(),
    );
    expect(label).toBe("Procedure");
  });

  it("falls back to the parent reservation's taxonomy when the drawing lacks it", () => {
    const reservationId = "33333333-3333-3333-3333-333333333333";
    const map = new Map([[reservationId, { enmax_acdnreservationtype: 1, enmax_acdndocumentsubtype: 1 }]]);
    const label = typeLabelForDrawingRow(
      { _enmax_acdnreservation_value: reservationId },
      map,
    );
    expect(label).toBe("Drawing Document");
  });

  it("defaults to Drawing when neither the row nor a linked reservation is found", () => {
    const label = typeLabelForDrawingRow({}, new Map());
    expect(label).toBe("Drawing");
  });
});
