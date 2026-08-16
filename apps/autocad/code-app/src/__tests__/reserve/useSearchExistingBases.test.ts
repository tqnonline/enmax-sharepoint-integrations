import { type ReactNode, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../generated", () => ({
  Enmax_autocaddrawingsService: { getAll: vi.fn() },
}));

import { Enmax_autocaddrawingsService } from "../../generated";
import { useSearchExistingBases } from "../../features/reserve/hooks/useSearchExistingBases";

const mockGetAll = vi.mocked(Enmax_autocaddrawingsService.getAll);

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => {
  mockGetAll.mockReset();
});

describe("useSearchExistingBases", () => {
  it("does not query until the search term has at least 2 characters", () => {
    const { result } = renderHook(
      () => useSearchExistingBases("G", "Drawing", undefined),
      { wrapper: wrapper() },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it("maps rows into ExistingBase shape and scopes the OData filter to the taxonomy", async () => {
    mockGetAll.mockResolvedValue({
      success: true,
      data: [{
        enmax_autocaddrawingid: "d1",
        enmax_acdnnumber: "GG-CG-00-ECS-AST-DD-0001",
        enmax_acdntitle: "Base drawing",
        enmax_acdnsheetcount: 3,
        enmax_acdnstate: 1,
        enmax_acdnreservationtype: 1,
        enmax_acdndocumentsubtype: 2,
        "_enmax_acdnbusiness_value": "bus-1",
        "_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue": "GG",
        "_enmax_acdnasset_value": "asset-1",
      }],
    });

    const { result } = renderHook(
      () => useSearchExistingBases("GG-CG", "Drawing", "Drawing"),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.data).toHaveLength(1));

    const filter = mockGetAll.mock.calls[0][0]?.filter ?? "";
    expect(filter).toContain("contains(enmax_acdnnumber,'GG-CG')");
    expect(filter).toContain("enmax_acdnstate ne 5");

    expect(result.current.data?.[0]).toMatchObject({
      id: "d1",
      number: "GG-CG-00-ECS-AST-DD-0001",
      title: "Base drawing",
      childCount: 3,
      state: 1,
      reservationType: 1,
      documentSubtype: 2,
      business: "bus-1",
      businessDisplay: "GG",
      asset: "asset-1",
      assetDisplay: "",
    });
  });

  it("returns an empty array when the service call fails", async () => {
    mockGetAll.mockResolvedValue({ success: false, data: undefined });
    const { result } = renderHook(
      () => useSearchExistingBases("GG", "Document", "Standard"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("Form Existing search scopes to Procedure numbers (Form appends under Procedure)", async () => {
    mockGetAll.mockResolvedValue({ success: true, data: [] });
    const { result } = renderHook(
      () => useSearchExistingBases("GG-9A", "Document", "Form"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    const filter = mockGetAll.mock.calls[0][0]?.filter ?? "";
    expect(filter).toContain("contains(enmax_acdnnumber,'GG-9A')");
    expect(filter).toContain(`enmax_acdndocumentsubtype eq 4`); // Procedure
    expect(filter).not.toContain(`enmax_acdndocumentsubtype eq 5`); // Form
  });
});
