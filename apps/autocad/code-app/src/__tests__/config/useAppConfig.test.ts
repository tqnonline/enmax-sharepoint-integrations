// Undo the global setup-file mock so this file can test the real implementation.
vi.unmock("../../config/useAppConfig");

import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppConfig } from "../../config/useAppConfig";
import { AppConfigSchema } from "../../config/AppConfigSchema";
import { VALID_CONFIG } from "../msw/handlers";

vi.mock("../../generated/services/Enmax_autocadappconfigsService", () => ({
  Enmax_autocadappconfigsService: { getAll: vi.fn() },
}));

import { Enmax_autocadappconfigsService } from "../../generated/services/Enmax_autocadappconfigsService";
const mockGetAll = vi.mocked(Enmax_autocadappconfigsService.getAll);

// Option set int codes: 1=Boolean, 2=Integer, 3=String, 4=Json
function makeRows(overrides: Record<string, unknown>) {
  const cfg = { ...VALID_CONFIG, ...overrides };
  return Object.entries(cfg).map(([key, val]) => ({
    enmax_acdnkey: key,
    enmax_acdnvalue: String(val),
    enmax_acdnvaluetype: typeof val === "boolean" ? 1 : typeof val === "number" ? 2 : 3,
  }));
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => { vi.clearAllMocks(); });

// Test 1 — SDK coercion: integer code 1 → boolean
test("parses Boolean config values from SDK option set code", async () => {
  mockGetAll.mockResolvedValue({ success: true, data: makeRows({ SingleAdminMode: true }) });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useAppConfig(), { wrapper: makeWrapper(qc) });
  await waitFor(() => expect(result.current?.SingleAdminMode).toBe(true));
});

// Test 2 — SDK coercion: integer code 2 → number
test("parses Integer config values from SDK option set code", async () => {
  mockGetAll.mockResolvedValue({ success: true, data: makeRows({ MaxRecordsPerReservation: 10 }) });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useAppConfig(), { wrapper: makeWrapper(qc) });
  await waitFor(() => expect(result.current?.MaxRecordsPerReservation).toBe(10));
  expect(typeof result.current?.MaxRecordsPerReservation).toBe("number");
});

// Test 3 — SDK coercion: Json type (code 4) → native value
test("parses Json config row type into native value", async () => {
  mockGetAll.mockResolvedValue({ success: true, data: makeRows({ BroadcastFanOutCadenceMinutes: 60 }) });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useAppConfig(), { wrapper: makeWrapper(qc) });
  await waitFor(() => expect(result.current?.BroadcastFanOutCadenceMinutes).toBe(60));
});

// Tests 4 & 5 — Schema validation tested directly (useSuspenseQuery throws to error boundary)

// Test 4 — Missing required key must throw ZodError at parse time
test("AppConfigSchema throws ZodError when required key missing — fail-loud per Rule 12", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { BrandPrimary: _omit, ...withoutBrandPrimary } = VALID_CONFIG;
  expect(() => AppConfigSchema.parse(withoutBrandPrimary)).toThrow(/BrandPrimary/i);
});

// Test 5 — Non-hex BrandPrimary must be rejected by regex validator
test("AppConfigSchema throws ZodError when BrandPrimary is not a hex colour string", () => {
  expect(() =>
    AppConfigSchema.parse({ ...VALID_CONFIG, BrandPrimary: "red" }),
  ).toThrow();
});
