import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EnmaxDataGrid } from "../../components/DataGrid/EnmaxDataGrid";
import type { ColumnDef } from "../../components/DataGrid/types";

vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 10 }) }));
vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: "User", isPending: false }) }));
interface Row { id: string; }
const columns: ColumnDef<Row>[] = [{ id: "id", header: "ID", accessor: r => r.id }];

test("quick-search hidden when enableQuickSearch=false", async () => {
  const fetcher = vi.fn().mockResolvedValue({ rows: [], totalCount: 0 });
  renderWithProviders(<EnmaxDataGrid<Row> queryKey={["q"]} fetcher={fetcher} columns={columns} rowKey={r => r.id} enableQuickSearch={false} emptyMessage="none" />);
  await screen.findByText("none");
  expect(screen.queryByLabelText("Quick search")).not.toBeInTheDocument();
});

test("quick-search shown by default", async () => {
  const fetcher = vi.fn().mockResolvedValue({ rows: [], totalCount: 0 });
  renderWithProviders(<EnmaxDataGrid<Row> queryKey={["q2"]} fetcher={fetcher} columns={columns} rowKey={r => r.id} emptyMessage="none" />);
  await screen.findByText("none");
  expect(screen.getByLabelText("Quick search")).toBeInTheDocument();
});
