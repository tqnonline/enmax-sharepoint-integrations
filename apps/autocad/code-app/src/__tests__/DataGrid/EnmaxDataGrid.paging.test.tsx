import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EnmaxDataGrid } from "../../components/DataGrid/EnmaxDataGrid";
import type { ColumnDef } from "../../components/DataGrid/types";

vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 10 }) }));
vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: "User", isPending: false }) }));

interface Row { id: string; }
const columns: ColumnDef<Row>[] = [{ id: "id", header: "ID", accessor: r => r.id }];

afterEach(() => vi.clearAllMocks());

// Forward-only Dataverse paging: the grid caches each page's skipToken cookie and
// hands it back to the fetcher when navigating to that page (never sends $skip).
test("grid feeds the cached skipToken to the fetcher on next page", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ rows: [{ id: "a" }], totalCount: 100, skipToken: "TOKEN_P1" })
    .mockResolvedValue({ rows: [{ id: "b" }], totalCount: 100, skipToken: "TOKEN_P2" });

  renderWithProviders(
    <EnmaxDataGrid<Row> queryKey={["pg"]} fetcher={fetcher} columns={columns} rowKey={r => r.id} />,
  );

  // First page: no token.
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(fetcher.mock.calls[0][0]).toMatchObject({ page: 0, skipToken: undefined });

  // Next page: grid replays the cookie it received for page 1.
  const next = await screen.findByRole("button", { name: /next/i });
  await user.click(next);
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ page: 1, skipToken: "TOKEN_P1" })),
  );
});
