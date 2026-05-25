import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EnmaxDataGrid } from "../../components/DataGrid/EnmaxDataGrid";
import type { ColumnDef } from "../../components/DataGrid/types";

vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 2 }) }));
vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: "Admin", isPending: false }) }));

interface Row { id: string; name: string; }
const columns: ColumnDef<Row>[] = [{ id: "name", header: "Name", accessor: r => r.name }];

test("grid page size derives from GridPageSize config when no initialPageSize prop", async () => {
  const fetcher = vi.fn().mockResolvedValue({ rows: [{ id: "1", name: "a" }, { id: "2", name: "b" }], totalCount: 5 });
  renderWithProviders(
    <EnmaxDataGrid<Row> queryKey={["t"]} fetcher={fetcher} columns={columns} rowKey={r => r.id} />,
  );
  await screen.findByText("a");
  expect(await screen.findByText(/Page 1 of 3/)).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 2 }));
});
