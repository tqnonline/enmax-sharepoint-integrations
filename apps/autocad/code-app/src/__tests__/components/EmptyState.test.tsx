import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EmptyState } from "../../components/EmptyState";

test("renders title + subtitle and fires action", async () => {
  const onAdd = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<EmptyState title="No reference data yet" subtitle="Add the first row" actionLabel="Add Row" onAction={onAdd} />);
  expect(screen.getByText("No reference data yet")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /add row/i }));
  expect(onAdd).toHaveBeenCalledOnce();
});
