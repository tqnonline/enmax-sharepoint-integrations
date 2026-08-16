import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EnmaxDataGrid } from "../../components/DataGrid/EnmaxDataGrid";
import type { ColumnDef } from "../../components/DataGrid/types";

vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 10 }) }));
vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: "Admin", isPending: false }) }));
interface Row { id: string; }
const columns: ColumnDef<Row>[] = [{ id: "id", header: "ID", accessor: r => r.id }];

test("genuine zero rows shows empty state, not an error", async () => {
  const fetcher = vi.fn().mockResolvedValue({ rows: [], totalCount: 0 });
  renderWithProviders(<EnmaxDataGrid<Row> queryKey={["e"]} fetcher={fetcher} columns={columns} rowKey={r => r.id} emptyMessage="No drawings yet" />);
  expect(await screen.findByText("No drawings yet")).toBeInTheDocument();
  expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
});

test("fetch error shows error, not empty state", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
  renderWithProviders(<EnmaxDataGrid<Row> queryKey={["err"]} fetcher={fetcher} columns={columns} rowKey={r => r.id} emptyMessage="No drawings yet" errorMessage="Failed to load data." />);
  expect(await screen.findByText("Failed to load data.")).toBeInTheDocument();
  expect(screen.queryByText("No drawings yet")).not.toBeInTheDocument();
});
