import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("../../features/checkout/api/checkoutClient", () => ({
  checkOut: vi.fn().mockResolvedValue({ checkoutId: "c1" }),
  checkOutSheets: vi.fn().mockResolvedValue({ checkoutId: "c2" }),
}));

import { useCheckOut } from "../../features/checkout/hooks/useCheckOut";
import { useCheckOutSheets } from "../../features/checkout/hooks/useCheckOutSheets";

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe("checkout mutation query invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("useCheckOut invalidates search-page and header-search", async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCheckOut(), { wrapper: wrapperFor(qc) });

    await act(async () => {
      await result.current.mutateAsync("drawing-1");
    });

    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0]);
    expect(keys).toContain("search-page");
    expect(keys).toContain("header-search");
  });

  test("useCheckOutSheets invalidates search-page", async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCheckOutSheets(), { wrapper: wrapperFor(qc) });

    await act(async () => {
      await result.current.mutateAsync({ drawingId: "d1", sheetIds: ["s1"] });
    });

    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0]);
    expect(keys).toContain("search-page");
    expect(keys).toContain("header-search");
  });
});
