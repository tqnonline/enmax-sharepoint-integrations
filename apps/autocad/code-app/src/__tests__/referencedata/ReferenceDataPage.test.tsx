import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { ReferenceDataPage } from "../../features/referencedata/ReferenceDataPage";
import { REF_TABLES } from "../../features/referencedata/tableConfig";
import type { RefRow } from "../../features/referencedata/useRefTableData";
import type { RefRowMutation } from "../../features/referencedata/useRefTableData";

// Mock RefRowPanel to avoid Fluent UI Drawer portal/animation timing issues in jsdom
vi.mock("../../features/referencedata/RefRowPanel", () => ({
  RefRowPanel: ({ open, onSave, onClose }: { open: boolean; onSave: (row: RefRowMutation) => void; onClose: () => void; editing: RefRow | null; isSaving: boolean }) =>
    open ? (
      <div>
        <input aria-label="Code" defaultValue="" />
        <input aria-label="Display Name" defaultValue="" />
        <button onClick={() => onSave({ code: "GG", displayName: "Duplicate", description: "", sortOrder: 0 })}>Save</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: "Admin", isPending: false }),
}));

const mockSaveMutateAsync       = vi.fn().mockResolvedValue(undefined);
const mockDeactivateMutateAsync = vi.fn().mockResolvedValue(undefined);

const MOCK_ROWS: RefRow[] = [
  { id: "biz-001", code: "GG",  displayName: "Generation",    description: "", sortOrder: 1, statecode: 0 },
  { id: "biz-002", code: "TX",  displayName: "Transmission",  description: "", sortOrder: 2, statecode: 0 },
];

vi.mock("../../features/referencedata/useRefTableData", () => ({
  useSaveRefRow:        () => ({ mutateAsync: mockSaveMutateAsync, isPending: false }),
  useDeactivateRefRow:  () => ({ mutateAsync: mockDeactivateMutateAsync, isPending: false }),
  makeRefTableFetcher:  () => async () => ({ rows: MOCK_ROWS, totalCount: MOCK_ROWS.length }),
  fetchMaxSortOrder:    vi.fn().mockResolvedValue(0),
  fetchRefTableSummary: vi.fn().mockResolvedValue({ total: 2, active: 2, inactive: 0 }),
}));

vi.mock("../../features/referencedata/useNextSortOrder", () => ({
  useRefTableSummary: () => ({ data: { total: 2, active: 2, inactive: 0 } }),
  useNextSortOrder:   () => ({ data: 10 }),
}));

vi.mock("../../features/referencedata/NumberSequencesGrid", () => ({
  NumberSequencesGrid: () => <div>Number Sequences Grid</div>,
}));

afterEach(() => { vi.clearAllMocks(); });

// Test 20 — Left rail shows all 13 reference tables
test("left rail renders all 13 reference tables", async () => {
  renderWithProviders(<ReferenceDataPage />);
  await waitFor(() => expect(screen.getByRole("navigation", { name: /reference tables/i })).toBeInTheDocument());
  for (const t of REF_TABLES) {
    expect(screen.getByRole("button", { name: t.displayName })).toBeInTheDocument();
  }
  expect(REF_TABLES).toHaveLength(13);
});

// Test 21 — Add Row form: code uniqueness rejection surfaced
test("save failure shows error toast with duplicate code message", async () => {
  mockSaveMutateAsync.mockRejectedValueOnce(new Error("Duplicate code"));
  const user = userEvent.setup();
  renderWithProviders(<ReferenceDataPage />);
  await user.click(screen.getByRole("button", { name: /add row/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(screen.getByText(/check for duplicate code/i)).toBeInTheDocument(), { timeout: 3000 });
});

// Test 22 — Deactivate calls useSaveRefRow mutation
test("Deactivate button calls deactivation mutation", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ReferenceDataPage />);
  await waitFor(() => expect(screen.getAllByRole("button", { name: /deactivate/i }).length).toBeGreaterThan(0));
  await user.click(screen.getAllByRole("button", { name: /deactivate/i })[0]);
  expect(mockDeactivateMutateAsync).toHaveBeenCalledWith({ id: "biz-001", activate: false });
});

// Test 23 — Switching to Number Sequences shows specialised grid
test("selecting Number Sequences shows specialised NumberSequencesGrid", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ReferenceDataPage />);
  await user.click(screen.getByRole("button", { name: "Number Sequences" }));
  await waitFor(() => expect(screen.getByText("Number Sequences Grid")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /add row/i })).not.toBeInTheDocument();
});
