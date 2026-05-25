import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { NumberSequenceImportButton } from "../../features/referencedata/NumberSequenceImport";

vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: "Admin", isPending: false }),
}));

vi.mock("../../generated", () => ({
  Enmax_autocadnumbersequencesService: {
    getAll: vi.fn().mockResolvedValue({
      success: true,
      data: [
        { enmax_autocadnumbersequenceid: "seq-001", enmax_acdnsequencekey: "GG-CG-00-ECS-AST-DD", enmax_acdnlastissued: 500 },
        { enmax_autocadnumbersequenceid: "seq-002", enmax_acdnsequencekey: "TX-DC-01-MEC-PMP-DR", enmax_acdnlastissued: 0  },
      ],
    }),
    update: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// papaparse is a real dependency; we use it directly

function makeCsvFile(content: string): File {
  const blob = new Blob([content], { type: "text/csv" });
  return new File([blob], "test.csv", { type: "text/csv" });
}

afterEach(() => vi.clearAllMocks());

// Test 24 — CSV import validation rejects SeedValue ≤ LastIssued
test("CSV preview marks row invalid when SeedValue ≤ LastIssued", async () => {
  const user = userEvent.setup();
  renderWithProviders(<NumberSequenceImportButton />);

  await user.click(screen.getByRole("button", { name: /bulk import/i }));
  await waitFor(() => expect(screen.getByText(/CSV format/i)).toBeInTheDocument());

  const csv = "SequenceKey,SeedValue,Reason\nGG-CG-00-ECS-AST-DD,400,Too low\n";
  const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
  await user.upload(fileInput, makeCsvFile(csv));

  await waitFor(() => expect(screen.getByText(/SeedValue.*must be.*LastIssued/i)).toBeInTheDocument(), { timeout: 3000 });
});

// Test 25 — Import button disabled when any row invalid (atomic validation)
test("Import button disabled when at least one row is invalid", async () => {
  const user = userEvent.setup();
  renderWithProviders(<NumberSequenceImportButton />);

  await user.click(screen.getByRole("button", { name: /bulk import/i }));
  await waitFor(() => expect(screen.getByText(/CSV format/i)).toBeInTheDocument());

  const csv = "SequenceKey,SeedValue,Reason\nGG-CG-00-ECS-AST-DD,600,Good\nTX-DC-01-MEC-PMP-DR,NOTANUMBER,Bad\n";
  const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
  await user.upload(fileInput, makeCsvFile(csv));

  // /^Import \(/ anchors to start so it doesn't match the outer "Bulk Import (CSV)" trigger button
  await waitFor(() => expect(screen.getByRole("button", { name: /^Import \(/i })).toBeDisabled(), { timeout: 3000 });
});

// Test 26 — Valid CSV enables import button
test("Import button enabled when all rows are valid", async () => {
  const user = userEvent.setup();
  renderWithProviders(<NumberSequenceImportButton />);

  await user.click(screen.getByRole("button", { name: /bulk import/i }));
  await waitFor(() => expect(screen.getByText(/CSV format/i)).toBeInTheDocument());

  const csv = "SequenceKey,SeedValue,Reason\nGG-CG-00-ECS-AST-DD,600,Legacy migration\nTX-DC-01-MEC-PMP-DR,100,First seed\n";
  const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
  await user.upload(fileInput, makeCsvFile(csv));

  await waitFor(() => {
    const btn = screen.getByRole("button", { name: /^Import \(/i });
    expect(btn).not.toBeDisabled();
  }, { timeout: 3000 });
});

// Test 27 — Edit Seed Value requires reason when LastIssued > 0
// This test is about the validation logic in NumberSequenceImport
test("seed validation rejects missing reason when sequence has issued rows", async () => {
  const user = userEvent.setup();
  renderWithProviders(<NumberSequenceImportButton />);

  await user.click(screen.getByRole("button", { name: /bulk import/i }));
  await waitFor(() => expect(screen.getByText(/CSV format/i)).toBeInTheDocument());

  // seq-001 has lastIssued=500, so it needs a Reason
  const csv = "SequenceKey,SeedValue,Reason\nGG-CG-00-ECS-AST-DD,600,\n";
  const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
  await user.upload(fileInput, makeCsvFile(csv));

  await waitFor(() => expect(screen.getByText(/Reason required/i)).toBeInTheDocument(), { timeout: 3000 });
});
