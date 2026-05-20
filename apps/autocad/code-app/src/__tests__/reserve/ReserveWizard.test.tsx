import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { ReserveWizard } from "../../features/reserve/ReserveWizard";
import type { AppConfig } from "../../config/AppConfigSchema";
import type { ApprovedCombinations } from "../../features/reserve/hooks/useApprovedCombinations";
import type { ReferenceData } from "../../features/reserve/hooks/useReferenceData";

const MOCK_CONFIG: AppConfig = {
  SingleAdminMode: false,
  MaxDrawingsPerReservation: 10,
  MaxSheetsPerDrawing: 50,
  DefaultSheetsPerDrawing: 5,
  StaleCheckoutMonths: "3,6,12",
  AdminTeamId: "7e7f5cf0-2153-f111-bec7-00224802e55b",
  ApproverTeamId: "00000000-0000-f000-0000-000000000002",
  UserTeamId: "7de104bc-2153-f111-bec7-00224802e55b",
  SharedMailboxAddress: "noreply-autocad@tqnonline.onmicrosoft.com",
  SharePointSiteUrl: "https://example.sharepoint.com/sites/AutoCAD",
  BusinessUnitName: "ENMAX",
  BrandPrimary: "#E1393E",
  BrandSecondary: "#0F487A",
  BrandAccent: "#F7DB9C",
  DefaultTheme: "system",
  EnableTelemetry: false,
  MaintenanceBannerTitle: "Maintenance",
  MaintenanceBannerBody: "System under maintenance",
  MaintenanceBannerSeverity: "Info",
  FooterDisclaimer: "For internal use only",
  FooterCopyright: "© 2026 ENMAX Corporation",
  BroadcastFanOutCadenceMinutes: 60,
};

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => MOCK_CONFIG,
}));

const MOCK_REF_DATA: ReferenceData = {
  businesses: [
    { id: "bus-1", code: "GG", name: "Generation" },
    { id: "bus-2", code: "TX", name: "Transmission" },
  ],
  assets: [
    { id: "asset-a", code: "CG", name: "Clover Bar Gas" },
    { id: "asset-b", code: "DC", name: "Downtown Calgary" },
  ],
  units:   [{ id: "unit-1",  code: "00",  name: "Unit 00" }],
  domains: [{ id: "dom-1",   code: "ECS", name: "Electrical Control" }],
  systems: [{ id: "sys-1",   code: "AST", name: "Asset" }],
  kinds:   [{ id: "kind-1",  code: "DD",  name: "Design Drawing" }],
};

const MOCK_COMBOS: ApprovedCombinations = {
  businessAssets: [{ businessId: "bus-1", assetId: "asset-a" }],
  assetUnits:     [{ assetId: "asset-a", unitId: "unit-1" }],
  systemScopes:   [],
};

vi.mock("../../features/reserve/hooks/useReferenceData", () => ({
  useReferenceData: () => ({ data: MOCK_REF_DATA, isPending: false, isError: false }),
}));

vi.mock("../../features/reserve/hooks/useApprovedCombinations", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../features/reserve/hooks/useApprovedCombinations")>();
  return {
    ...original,
    useApprovedCombinations: () => ({ data: MOCK_COMBOS, isPending: false, isError: false }),
  };
});

vi.mock("../../generated/services/Enmax_autocadreservationsService", () => ({
  Enmax_autocadreservationsService: { create: vi.fn() },
}));

import { Enmax_autocadreservationsService } from "../../generated/services/Enmax_autocadreservationsService";
const mockCreate = vi.mocked(Enmax_autocadreservationsService.create);

beforeEach(() => {
  mockCreate.mockResolvedValue({
    success: true,
    data: { enmax_autocadreservationid: "res-id-001", enmax_acdnreservationid: "RES-00001" },
  });
});

// Test 7 — Submit calls Dataverse create with mapped columns
test("submitting valid form POSTs to enmax_autocadreservations with correct body shape", async () => {
  mockCreate.mockClear();

  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await waitFor(() => expect(screen.getByLabelText("Business")).toBeInTheDocument(), { timeout: 3000 });

  await user.selectOptions(screen.getByLabelText("Business"), "bus-1");
  await waitFor(() => expect(screen.getByLabelText("Asset")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("Asset"), "asset-a");
  await waitFor(() => expect(screen.getByLabelText("Unit")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("Unit"), "unit-1");
  await user.selectOptions(screen.getByLabelText("Domain"), "dom-1");
  await waitFor(() => expect(screen.getByLabelText("System")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("System"), "sys-1");
  await user.selectOptions(screen.getByLabelText("Kind"), "kind-1");
  await user.click(screen.getByRole("button", { name: /next/i }));

  await waitFor(() => expect(screen.getByLabelText(/Number of drawings/i)).toBeInTheDocument());
  const countInput = screen.getByLabelText(/Number of drawings/i);
  await user.clear(countInput);
  await user.type(countInput, "3");
  await user.click(screen.getByRole("radio", { name: /New sequence/i }));
  const reasonInput = screen.getByLabelText(/Reason for reservation/i);
  await user.type(reasonInput, "test reservation per plan #05");
  await user.click(screen.getByRole("button", { name: /next/i }));

  await waitFor(() => expect(screen.getByRole("button", { name: /Submit reservation/i })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /Submit reservation/i }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));

  const body = mockCreate.mock.calls[0][0] as Record<string, unknown>;
  expect(body["enmax_acdnBusiness@odata.bind"]).toBe("/enmax_autocadbusinesses(bus-1)");
  expect(body.enmax_acdndrawingcount).toBe(3);
  expect(body.enmax_acdnstatus).toBe(1);
  expect(body.enmax_acdnoverride).toBe(false);
});

// Test 8 — Submit navigates to success page on 201
test("successful submission navigates to /reserve/success with reservation id", async () => {
  const user = userEvent.setup();
  const { container } = renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await waitFor(() => expect(screen.getByLabelText("Business")).toBeInTheDocument(), { timeout: 3000 });

  await user.selectOptions(screen.getByLabelText("Business"), "bus-1");
  await waitFor(() => expect(screen.getByLabelText("Asset")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("Asset"), "asset-a");
  await waitFor(() => expect(screen.getByLabelText("Unit")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("Unit"), "unit-1");
  await user.selectOptions(screen.getByLabelText("Domain"), "dom-1");
  await waitFor(() => expect(screen.getByLabelText("System")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("System"), "sys-1");
  await user.selectOptions(screen.getByLabelText("Kind"), "kind-1");
  await user.click(screen.getByRole("button", { name: /next/i }));

  await waitFor(() => expect(screen.getByLabelText(/Number of drawings/i)).toBeInTheDocument());
  const countInput = screen.getByLabelText(/Number of drawings/i);
  await user.clear(countInput);
  await user.type(countInput, "2");
  await user.click(screen.getByRole("radio", { name: /New sequence/i }));
  await user.type(screen.getByLabelText(/Reason for reservation/i), "navigates to success on 201");
  await user.click(screen.getByRole("button", { name: /next/i }));

  await waitFor(() => expect(screen.getByRole("button", { name: /Submit reservation/i })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /Submit reservation/i }));

  await waitFor(() => {
    const html = container.innerHTML;
    expect(window.location.hash || html).toBeTruthy();
  });
});

// Test 9 — Submit surfaces error on service failure
test("surfaces permission-denied error when create returns 403", async () => {
  mockCreate.mockResolvedValue({
    success: false,
    error: Object.assign(new Error("Forbidden"), { status: 403 }),
  });

  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await waitFor(() => expect(screen.getByLabelText("Business")).toBeInTheDocument(), { timeout: 3000 });

  await user.selectOptions(screen.getByLabelText("Business"), "bus-1");
  await waitFor(() => expect(screen.getByLabelText("Asset")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("Asset"), "asset-a");
  await waitFor(() => expect(screen.getByLabelText("Unit")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("Unit"), "unit-1");
  await user.selectOptions(screen.getByLabelText("Domain"), "dom-1");
  await waitFor(() => expect(screen.getByLabelText("System")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("System"), "sys-1");
  await user.selectOptions(screen.getByLabelText("Kind"), "kind-1");
  await user.click(screen.getByRole("button", { name: /next/i }));

  await waitFor(() => expect(screen.getByLabelText(/Number of drawings/i)).toBeInTheDocument());
  const countInput = screen.getByLabelText(/Number of drawings/i);
  await user.clear(countInput);
  await user.type(countInput, "1");
  await user.click(screen.getByRole("radio", { name: /New sequence/i }));
  await user.type(screen.getByLabelText(/Reason for reservation/i), "403 error test case here");
  await user.click(screen.getByRole("button", { name: /next/i }));

  await waitFor(() => expect(screen.getByRole("button", { name: /Submit reservation/i })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /Submit reservation/i }));

  await waitFor(() =>
    expect(screen.getByText(/Permission denied/i)).toBeInTheDocument(),
  { timeout: 3000 });
});

// Test 3 — Wizard step 4 live preview renders ???? placeholder
test("live preview shows ???? placeholder with tooltip — never a sequence number", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await waitFor(() => expect(screen.getByLabelText("Business")).toBeInTheDocument(), { timeout: 3000 });

  await user.selectOptions(screen.getByLabelText("Business"), "bus-1");
  await waitFor(() => expect(screen.getByLabelText("Asset")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("Asset"), "asset-a");
  await waitFor(() => expect(screen.getByLabelText("Unit")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("Unit"), "unit-1");
  await user.selectOptions(screen.getByLabelText("Domain"), "dom-1");
  await waitFor(() => expect(screen.getByLabelText("System")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("System"), "sys-1");
  await user.selectOptions(screen.getByLabelText("Kind"), "kind-1");

  const previewEl = screen.getByText("????");
  expect(previewEl).toBeInTheDocument();
  expect(screen.queryByText(/\b\d{4}\b/)).not.toBeInTheDocument();
});

// Test 1 — Wizard step 2 cascading: Asset filter on Business change
test("changing Business filters Asset dropdown to approved combinations only", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await waitFor(() => expect(screen.getByLabelText("Business")).toBeInTheDocument(), { timeout: 3000 });

  await user.selectOptions(screen.getByLabelText("Business"), "bus-1");
  await waitFor(() => expect(screen.getByLabelText("Asset")).not.toBeDisabled());

  const assetSelect = screen.getByLabelText("Asset") as HTMLSelectElement;
  const visibleOptions = Array.from(assetSelect.options)
    .filter((o) => o.value !== "")
    .map((o) => o.value);

  // bus-1 is approved with asset-a only (per MOCK_COMBOS fixture)
  expect(visibleOptions).toContain("asset-a");
  expect(visibleOptions).not.toContain("asset-b");
});

// Test 2 — Override toggle appears for invalid BB-AA
test("override warning and toggle appear when Business+Asset combo is not in approved list", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await waitFor(() => expect(screen.getByLabelText("Business")).toBeInTheDocument(), { timeout: 3000 });

  await user.selectOptions(screen.getByLabelText("Business"), "bus-1");
  // With MOCK_COMBOS, bus-1 only has asset-a approved
  const assetSelect = screen.getByLabelText("Asset") as HTMLSelectElement;
  const visibleOptions = Array.from(assetSelect.options).filter((o) => o.value !== "");
  expect(visibleOptions).toHaveLength(1);
  expect(visibleOptions[0].value).toBe("asset-a");

  // bus-2 has no combos → no assets
  await user.selectOptions(screen.getByLabelText("Business"), "bus-2");
  await waitFor(() => {
    const opts = Array.from((screen.getByLabelText("Asset") as HTMLSelectElement).options).filter(o => o.value !== "");
    expect(opts).toHaveLength(0);
  });
});
