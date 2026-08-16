import { type ReactNode, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../generated", () => ({
  Enmax_autocadbusinessesService: { getAll: vi.fn() },
  Enmax_autocadassetsService: { getAll: vi.fn() },
  Enmax_autocadunitsService: { getAll: vi.fn() },
  Enmax_autocaddomainsService: { getAll: vi.fn() },
  Enmax_autocadsystemsService: { getAll: vi.fn() },
  Enmax_autocadkindsService: { getAll: vi.fn() },
}));

import {
  Enmax_autocadassetsService,
  Enmax_autocadbusinessesService,
  Enmax_autocaddomainsService,
  Enmax_autocadkindsService,
  Enmax_autocadsystemsService,
  Enmax_autocadunitsService,
} from "../../generated";
import { useReferenceData } from "../../features/reserve/hooks/useReferenceData";

const services = [
  Enmax_autocadbusinessesService,
  Enmax_autocadassetsService,
  Enmax_autocadunitsService,
  Enmax_autocaddomainsService,
  Enmax_autocadsystemsService,
  Enmax_autocadkindsService,
];

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => {
  for (const svc of services) vi.mocked(svc.getAll).mockReset();
});

describe("useReferenceData", () => {
  it("maps every reference collection and falls back to code when the display name is blank", async () => {
    vi.mocked(Enmax_autocadbusinessesService.getAll).mockResolvedValue({
      success: true,
      data: [{ enmax_autocadbusinessid: "biz-1", enmax_acdncode: "GG", enmax_acdndisplayname: undefined } as never],
    });
    vi.mocked(Enmax_autocadassetsService.getAll).mockResolvedValue({
      success: true,
      data: [{ enmax_autocadassetid: "asset-1", enmax_acdncode: "CG", enmax_acdndisplayname: "Calgary" } as never],
    });
    vi.mocked(Enmax_autocadunitsService.getAll).mockResolvedValue({
      success: true,
      data: [{ enmax_autocadunitid: "unit-1", enmax_acdncode: "00", enmax_acdndisplayname: "Unit 00" } as never],
    });
    vi.mocked(Enmax_autocaddomainsService.getAll).mockResolvedValue({
      success: true,
      data: [{ enmax_autocaddomainid: "dom-1", enmax_acdncode: "ECS", enmax_acdndisplayname: "ECS" } as never],
    });
    vi.mocked(Enmax_autocadsystemsService.getAll).mockResolvedValue({
      success: true,
      data: [{ enmax_autocadsystemid: "sys-1", enmax_acdncode: "AST", enmax_acdndisplayname: "AST" } as never],
    });
    vi.mocked(Enmax_autocadkindsService.getAll).mockResolvedValue({
      success: true,
      data: [{ enmax_autocadkindid: "kind-1", enmax_acdncode: "DD", enmax_acdndisplayname: "Design" } as never],
    });

    const { result } = renderHook(() => useReferenceData(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.businesses).toEqual([{ id: "biz-1", code: "GG", name: "GG" }]);
    expect(result.current.data?.assets).toEqual([{ id: "asset-1", code: "CG", name: "Calgary" }]);
    expect(result.current.data?.units).toEqual([{ id: "unit-1", code: "00", name: "Unit 00" }]);
    expect(result.current.data?.kinds).toEqual([{ id: "kind-1", code: "DD", name: "Design" }]);
  });

  it("throws when any reference collection fails to load", async () => {
    vi.mocked(Enmax_autocadbusinessesService.getAll).mockResolvedValue({ success: true, data: [] });
    vi.mocked(Enmax_autocadassetsService.getAll).mockResolvedValue({ success: true, data: [] });
    vi.mocked(Enmax_autocadunitsService.getAll).mockResolvedValue({ success: true, data: [] });
    vi.mocked(Enmax_autocaddomainsService.getAll).mockResolvedValue({ success: true, data: [] });
    vi.mocked(Enmax_autocadsystemsService.getAll).mockResolvedValue({ success: true, data: [] });
    vi.mocked(Enmax_autocadkindsService.getAll).mockResolvedValue({ success: false, data: undefined });

    const { result } = renderHook(() => useReferenceData(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("kinds fetch failed");
  });
});
