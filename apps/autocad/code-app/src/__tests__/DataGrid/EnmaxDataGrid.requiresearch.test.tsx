import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EnmaxDataGrid } from "../../components/DataGrid/EnmaxDataGrid";
import type { ColumnDef } from "../../components/DataGrid/types";

vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 10 }) }));
vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: "User", isPending: false }) }));

interface Row { id: string; }
const columns: ColumnDef<Row>[] = [{ id: "id", header: "ID", accessor: r => r.id }];

// The bug: navigating to Search ran an unbounded fetch on mount and errored.
// requireSearch must suppress the fetch entirely until a query exists, and show the prompt instead.
test("requireSearch: does not fetch on empty query and shows prompt", async () => {
  const fetcher = vi.fn().mockResolvedValue({ rows: [], totalCount: 0 });
  renderWithProviders(
    <EnmaxDataGrid<Row> queryKey={["rs1"]} fetcher={fetcher} columns={columns} rowKey={r => r.id} requireSearch searchPrompt="Type to search" />,
  );
  expect(await screen.findByText("Type to search")).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});

// Once a query is present (>= 2 chars), the grid fetches as normal.
test("requireSearch: fetches when a query is present", async () => {
  const fetcher = vi.fn().mockResolvedValue({ rows: [{ id: "a" }], totalCount: 1 });
  renderWithProviders(
    <EnmaxDataGrid<Row> queryKey={["rs2"]} fetcher={fetcher} columns={columns} rowKey={r => r.id} requireSearch searchPrompt="Type to search" />,
    { initialPath: "/?q=ab" },
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ search: "ab" }));
  expect(screen.queryByText("Type to search")).not.toBeInTheDocument();
});

// A one-char query is below the threshold — still gated.
test("requireSearch: single char stays gated", async () => {
  const fetcher = vi.fn().mockResolvedValue({ rows: [], totalCount: 0 });
  renderWithProviders(
    <EnmaxDataGrid<Row> queryKey={["rs3"]} fetcher={fetcher} columns={columns} rowKey={r => r.id} requireSearch searchPrompt="Type to search" />,
    { initialPath: "/?q=a" },
  );
  expect(await screen.findByText("Type to search")).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});
