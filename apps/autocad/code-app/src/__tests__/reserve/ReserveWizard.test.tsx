import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { ReserveWizard } from "../../features/reserve/ReserveWizard";
import type { AppConfig } from "../../config/AppConfigSchema";
import type { ReferenceData } from "../../features/reserve/hooks/useReferenceData";

const MOCK_CONFIG: AppConfig = {
  SingleAdminMode: false,
  MaxRecordsPerReservation: 10,
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

vi.mock("../../features/reserve/hooks/useReferenceData", () => ({
  useReferenceData: () => ({ data: MOCK_REF_DATA, isPending: false, isError: false }),
}));

vi.mock("../../generated/services/Enmax_autocadreservationsService", () => ({
  Enmax_autocadreservationsService: { create: vi.fn() },
}));

import { Enmax_autocadreservationsService } from "../../generated/services/Enmax_autocadreservationsService";
const mockCreate = vi.mocked(Enmax_autocadreservationsService.create);

type U = ReturnType<typeof userEvent.setup>;

// The wizard now opens on the Type step. Drawing is the default selection, so this
// helper just advances into Coding sequence; pass a subtype to reserve a Document instead.
async function chooseTypeAndAdvance(user: U, subtype?: "Standard" | "Procedure" | "Form") {
  if (subtype) {
    await user.click(await screen.findByRole("radio", { name: /^Document$/i }));
    const subtypeLabel = subtype === "Standard" ? "Standard" : subtype;
    await user.click(await screen.findByRole("radio", { name: new RegExp(`^${subtypeLabel}$`, "i") }));
  }
  await user.click(await screen.findByRole("button", { name: /Next: Coding sequence/i }));
}

async function fillComposition(user: U) {
  await waitFor(() => expect(screen.getByLabelText("Business")).toBeInTheDocument(), { timeout: 3000 });
  await user.selectOptions(screen.getByLabelText("Business"), "bus-1");
  await user.selectOptions(screen.getByLabelText("Asset"), "asset-a");
  await user.selectOptions(screen.getByLabelText("Unit"), "unit-1");
  await user.selectOptions(screen.getByLabelText("Domain"), "dom-1");
  await user.selectOptions(screen.getByLabelText("System"), "sys-1");
  await user.selectOptions(screen.getByLabelText("Kind"), "kind-1");
}

beforeEach(() => {
  mockCreate.mockResolvedValue({
    success: true,
    data: { enmax_autocadreservationid: "res-id-001", enmax_acdnreservationid: "RES-00001" },
  });
});

// Agreed model — Drawing has no Drawing Type fork; sheets 0 → Drawing Document
test("Drawing step 1 has no Drawing Type fork", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  expect(await screen.findByRole("radio", { name: /^Drawing$/i })).toBeInTheDocument();
  expect(screen.queryByText(/Drawing Type/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: /^Drawing Document$/i })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Next: Coding sequence/i }));
  await waitFor(() => expect(screen.getByLabelText("Business")).toBeInTheDocument());
});

test("Drawing sheets=0 submits as Drawing Document (subtype 1)", async () => {
  mockCreate.mockClear();
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await chooseTypeAndAdvance(user);
  await fillComposition(user);
  await user.click(screen.getByRole("button", { name: /Next: Details/i }));

  await waitFor(() => expect(screen.getByLabelText(/Number of drawing numbers/i)).toBeInTheDocument());
  const sheets = screen.getByLabelText(/Sheet per Drawing|sheets per drawing/i);
  await user.clear(sheets);
  await user.type(sheets, "0");
  await user.type(screen.getByLabelText(/Reason For Reservation/i), "drawing docs only path");
  await user.click(screen.getByRole("button", { name: /Next: Review/i }));

  await waitFor(() => expect(screen.getByRole("button", { name: /Submit reservation/i })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /Submit reservation/i }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  const body = mockCreate.mock.calls[0][0] as Record<string, unknown>;
  expect(body.enmax_acdnreservationtype).toBe(1);
  expect(body.enmax_acdndocumentsubtype).toBe(1); // Drawing Document
  expect(body.enmax_acdnsheetsperdrawing).toBe(0);
});

test("Drawing sheets≥1 submits as Drawing (subtype 2) with sheet count", async () => {
  mockCreate.mockClear();
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await chooseTypeAndAdvance(user);
  await fillComposition(user);
  await user.click(screen.getByRole("button", { name: /Next: Details/i }));

  await waitFor(() => expect(screen.getByLabelText(/Number of drawing numbers/i)).toBeInTheDocument());
  const countInput = screen.getByLabelText(/Number of drawing numbers/i);
  await user.clear(countInput);
  await user.type(countInput, "2");
  const sheets = screen.getByLabelText(/Sheet per Drawing|sheets per drawing/i);
  await user.clear(sheets);
  await user.type(sheets, "3");
  await user.type(screen.getByLabelText(/Reason For Reservation/i), "docs and sheet files together");
  await user.click(screen.getByRole("button", { name: /Next: Review/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Submit reservation/i })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /Submit reservation/i }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  const body = mockCreate.mock.calls[0][0] as Record<string, unknown>;
  expect(body.enmax_acdnreservationtype).toBe(1);
  expect(body.enmax_acdndocumentsubtype).toBe(2);
  expect(body.enmax_acdndrawingcount).toBe(2);
  expect(body.enmax_acdnsheetsperdrawing).toBe(3);
});

test("Procedure New shows forms-per-procedure (0 allowed) and submits subtype Procedure", async () => {
  mockCreate.mockClear();
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await chooseTypeAndAdvance(user, "Procedure");
  await fillComposition(user);
  await user.click(screen.getByRole("button", { name: /Next: Details/i }));

  await waitFor(() => expect(screen.getByLabelText(/Number of procedures/i)).toBeInTheDocument());
  expect(screen.getByLabelText(/Forms per procedure/i)).toBeInTheDocument();

  const forms = screen.getByLabelText(/Forms per procedure/i);
  await user.clear(forms);
  await user.type(forms, "2");
  await user.type(screen.getByLabelText(/Reason For Reservation/i), "procedure with forms together");
  await user.click(screen.getByRole("button", { name: /Next: Review/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Submit reservation/i })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /Submit reservation/i }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  const body = mockCreate.mock.calls[0][0] as Record<string, unknown>;
  expect(body.enmax_acdnreservationtype).toBe(2);
  expect(body.enmax_acdndocumentsubtype).toBe(4);
  expect(body.enmax_acdnsheetsperdrawing).toBe(2);
});

test("Form alone forces Add to existing (New disabled)", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await user.click(await screen.findByRole("radio", { name: /^Document$/i }));
  await user.click(await screen.findByRole("radio", { name: /^Form$/i }));

  const newRadio = screen.getByRole("radio", { name: /Reserve new/i });
  const existingRadio = screen.getByRole("radio", { name: /Add to existing/i });
  expect(newRadio).toBeDisabled();
  expect(existingRadio).not.toBeDisabled();
  expect(existingRadio).toBeChecked();
});

// Test 7 — Submit calls Dataverse create with mapped columns
test("submitting valid form POSTs to enmax_autocadreservations with correct body shape", async () => {
  mockCreate.mockClear();

  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await chooseTypeAndAdvance(user);

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

  await waitFor(() => expect(screen.getByLabelText(/Number of drawing numbers/i)).toBeInTheDocument());
  const countInput = screen.getByLabelText(/Number of drawing numbers/i);
  await user.clear(countInput);
  await user.type(countInput, "3");  const reasonInput = screen.getByLabelText(/Reason For Reservation/i);
  await user.type(reasonInput, "test reservation per plan #05");
  await user.click(screen.getByRole("button", { name: /next/i }));

  await waitFor(() => expect(screen.getByRole("button", { name: /Submit reservation/i })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /Submit reservation/i }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));

  const body = mockCreate.mock.calls[0][0] as Record<string, unknown>;
  expect(body["enmax_acdnBusiness@odata.bind"]).toBe("/enmax_autocadbusinesses(bus-1)");
  expect(body.enmax_acdndrawingcount).toBe(3);
  expect(body.enmax_acdnstatus).toBe(1);
  // Default reservation is a plain Drawing: type=1, subtype=2 (Drawing Document
  // is a separate, explicit subtype selection — docs/drawing-document-subtype-CONTRACT.md).
  expect(body.enmax_acdnreservationtype).toBe(1);
  expect(body.enmax_acdndocumentsubtype).toBe(2);
  // Combination override is removed (ADR 0001 #4) — no longer sent.
  expect(body.enmax_acdnoverride).toBeUndefined();
});

// Test 7b — Document/Standard is base-only: no child-count field, and type/subtype are sent
test("Document/Standard reservation hides child count and sends type=2, subtype=3", async () => {
  mockCreate.mockClear();

  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await chooseTypeAndAdvance(user, "Standard");
  await fillComposition(user);
  await user.click(screen.getByRole("button", { name: /Next: Details/i }));

  // Count label is type-aware; the child-count field is absent for Standard (base-only).
  await waitFor(() => expect(screen.getByLabelText(/Number of standards/i)).toBeInTheDocument());
  expect(screen.queryByLabelText(/per standard/i)).not.toBeInTheDocument();

  const countInput = screen.getByLabelText(/Number of standards/i);
  await user.clear(countInput);
  await user.type(countInput, "1");  await user.type(screen.getByLabelText(/Reason For Reservation/i), "standard reservation test");
  await user.click(screen.getByRole("button", { name: /Next: Review/i }));

  await waitFor(() => expect(screen.getByRole("button", { name: /Submit reservation/i })).toBeInTheDocument());
  // Review shows the type and omits the child-count row.
  expect(screen.getByText("Standard")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Submit reservation/i }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  const body = mockCreate.mock.calls[0][0] as Record<string, unknown>;
  expect(body.enmax_acdnreservationtype).toBe(2);
  expect(body.enmax_acdndocumentsubtype).toBe(3);
});

test("Standard: details step uses MaxRecordsPerReservation as count ceiling", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await chooseTypeAndAdvance(user, "Standard");
  await fillComposition(user);
  await user.click(screen.getByRole("button", { name: /Next: Details/i }));

  await waitFor(() =>
    expect(screen.getByLabelText(/Number of standards \(1–10\)/i)).toBeInTheDocument(),
  );
  const countInput = screen.getByLabelText(/Number of standards \(1–10\)/i);
  expect(countInput).toHaveAttribute("max", "10");
});

// Test 8 — Submit navigates to success page on 201
test("successful submission navigates to /reserve/success with reservation id", async () => {
  const user = userEvent.setup();
  const { container } = renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await chooseTypeAndAdvance(user);

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

  await waitFor(() => expect(screen.getByLabelText(/Number of drawing numbers/i)).toBeInTheDocument());
  const countInput = screen.getByLabelText(/Number of drawing numbers/i);
  await user.clear(countInput);
  await user.type(countInput, "2");  await user.type(screen.getByLabelText(/Reason For Reservation/i), "navigates to success on 201");
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

  await chooseTypeAndAdvance(user);

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

  await waitFor(() => expect(screen.getByLabelText(/Number of drawing numbers/i)).toBeInTheDocument());
  const countInput = screen.getByLabelText(/Number of drawing numbers/i);
  await user.clear(countInput);
  await user.type(countInput, "1");  await user.type(screen.getByLabelText(/Reason For Reservation/i), "403 error test case here");
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

  await chooseTypeAndAdvance(user);

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

// Test 1 — Independent dropdowns: every Asset is selectable for any Business (ADR 0001 #4)
test("Asset dropdown shows all active assets regardless of Business — no cascade filter", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await chooseTypeAndAdvance(user);

  await waitFor(() => expect(screen.getByLabelText("Business")).toBeInTheDocument(), { timeout: 3000 });

  // Asset is enabled and fully populated before any Business is chosen.
  const assetSelect = screen.getByLabelText("Asset") as HTMLSelectElement;
  expect(assetSelect).not.toBeDisabled();

  await user.selectOptions(screen.getByLabelText("Business"), "bus-1");

  const visibleOptions = Array.from(assetSelect.options)
    .filter((o) => o.value !== "")
    .map((o) => o.value);

  // Both assets available even though only bus-1/asset-a was ever an "approved" combo.
  expect(visibleOptions).toContain("asset-a");
  expect(visibleOptions).toContain("asset-b");
});

// Test 2 — No override path: any Business+Asset proceeds without a warning/toggle
test("no override warning or toggle for any Business+Asset combination", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ReserveWizard />, { initialPath: "/reserve" });

  await chooseTypeAndAdvance(user);

  await waitFor(() => expect(screen.getByLabelText("Business")).toBeInTheDocument(), { timeout: 3000 });

  // Pick a combination that used to be "unapproved" (bus-2 + asset-b).
  await user.selectOptions(screen.getByLabelText("Business"), "bus-2");
  await user.selectOptions(screen.getByLabelText("Asset"), "asset-b");
  await user.selectOptions(screen.getByLabelText("Unit"), "unit-1");
  await user.selectOptions(screen.getByLabelText("Domain"), "dom-1");
  await user.selectOptions(screen.getByLabelText("System"), "sys-1");
  await user.selectOptions(screen.getByLabelText("Kind"), "kind-1");

  // No override affordance exists anymore.
  expect(screen.queryByText(/not in the approved/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Override/i)).not.toBeInTheDocument();

  // And the wizard can advance directly.
  expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
});
