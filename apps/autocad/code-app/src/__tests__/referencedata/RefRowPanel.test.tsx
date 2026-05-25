import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { RefRowPanel } from "../../features/referencedata/RefRowPanel";

// Fluent UI Drawer uses tabster which sets aria-hidden on the dialog until focus
// enters it via user interaction. Querying with { hidden: true } reaches the DOM
// content that is visually present but tabster-hidden in jsdom.
// Form submission uses fireEvent.submit on the form element to bypass portal focus issues.
test("Add Row defaults Sort Order to nextSortOrder and rejects 0", async () => {
  const onSave = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<RefRowPanel open editing={null} nextSortOrder={70} onClose={() => {}} onSave={onSave} isSaving={false} />);
  const sort = screen.getByRole("spinbutton", { name: /sort order/i, hidden: true }) as HTMLInputElement;
  expect(sort.value).toBe("70");
  await user.clear(sort); await user.type(sort, "0");
  await user.type(screen.getByLabelText(/^code/i), "XX");
  await user.type(screen.getByLabelText(/display name/i), "Test");
  const form = document.querySelector("form")!;
  fireEvent.submit(form);
  expect(onSave).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText(/greater than 0/i, { hidden: true })).toBeInTheDocument());
});
