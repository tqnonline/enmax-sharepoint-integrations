import { type ReactNode, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../features/reserve/api/addChildItemsClient", () => ({
  addChildItems: vi.fn(),
}));

import { addChildItems } from "../../features/reserve/api/addChildItemsClient";
import { useAddChildItems } from "../../features/reserve/hooks/useAddChildItems";

const mockAddChildItems = vi.mocked(addChildItems);

beforeEach(() => {
  mockAddChildItems.mockReset();
});

describe("useAddChildItems", () => {
  it("invalidates drawing-detail, drawing-sheets, and drawings queries on success", async () => {
    mockAddChildItems.mockResolvedValue({
      childrenCreated: 2,
      firstChildNumber: 4,
      lastChildNumber: 5,
      baseNumber: "GG-CG-00-ECS-AST-DD-0001",
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useAddChildItems(), { wrapper });

    await act(async () => {
      result.current.mutate({ drawingId: "d1", count: 2 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0]);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining(["drawing-detail", "drawing-sheets", "drawings"]),
    );
  });
});
