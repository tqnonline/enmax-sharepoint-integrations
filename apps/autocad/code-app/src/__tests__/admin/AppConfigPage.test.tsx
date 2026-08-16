import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { AppConfigPage } from "../../features/admin/AppConfigPage";
import type { ConfigRow, ConfigRowMutation } from "../../features/admin/useAppConfigAdmin";

vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: "Admin", isPending: false }) }));
vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 10 }) }));

const mockUpsert = vi.fn().mockResolvedValue(undefined);

vi.mock("../../features/admin/useAppConfigAdmin", () => ({
  VALUE_TYPE_LABELS: { 1: "Boolean", 2: "Integer", 3: "String", 4: "JSON" },
  fetchAppConfigRows: async () => ({
    rows: [
      { id: "1", key: "GridPageSize", value: "10", valueType: 2 },
      { id: "2", key: "RequireCheckInApproval", value: "false", valueType: 1 },
    ] as ConfigRow[],
    totalCount: 2,
  }),
  useUpsertConfigRow: () => ({ mutateAsync: mockUpsert, isPending: false }),
}));

// Mock the drawer to avoid Fluent portal/animation timing in jsdom.
vi.mock("../../features/admin/AppConfigRowPanel", () => ({
  AppConfigRowPanel: ({ open, editing, onSave, onClose }: { open: boolean; editing: ConfigRow | null; onSave: (r: ConfigRowMutation) => void; onClose: () => void }) =>
    open ? (
      <div>
        <span>panel:{editing ? editing.key : "new"}</span>
        <button onClick={() => onSave({ id: editing?.id, key: editing?.key ?? "NewKey", value: "v", valueType: 3 })}>Save</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

afterEach(() => vi.clearAllMocks());

// App Config now mirrors Reference Data: a grid of rows (key / value / type).
test("renders configuration rows in a grid", async () => {
  renderWithProviders(<AppConfigPage />);
  await waitFor(() => expect(screen.getByText("GridPageSize")).toBeInTheDocument());
  expect(screen.getByText("10")).toBeInTheDocument();
  expect(screen.getByText("Integer")).toBeInTheDocument();
  expect(screen.getByText("RequireCheckInApproval")).toBeInTheDocument();
});

// New capability: admins can add a new app configuration row.
test("Add Configuration opens the add panel", async () => {
  const user = userEvent.setup();
  renderWithProviders(<AppConfigPage />);
  await user.click(screen.getByRole("button", { name: /add configuration/i }));
  expect(await screen.findByText("panel:new")).toBeInTheDocument();
});

// Editing an existing row routes through the same upsert mutation.
test("Edit opens the panel and Save calls the upsert mutation", async () => {
  const user = userEvent.setup();
  renderWithProviders(<AppConfigPage />);
  await waitFor(() => expect(screen.getByText("GridPageSize")).toBeInTheDocument());
  await user.click(screen.getAllByRole("button", { name: /edit/i })[0]);
  expect(await screen.findByText("panel:GridPageSize")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: "1" })));
});
