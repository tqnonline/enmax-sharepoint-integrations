import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { SplitButton } from "../../components/SplitButton";

// SplitButton: primary action fires immediately; overflow menu items fire via ▾ caret.

test("SplitButton primary onClick fires when primary button is clicked", async () => {
  const onPrimary = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <SplitButton
      primaryLabel="Check Out"
      onPrimary={onPrimary}
      items={[{ key: "finalize", label: "Finalize", onClick: vi.fn() }]}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Check Out" }));
  expect(onPrimary).toHaveBeenCalledTimes(1);
});

test("SplitButton caret opens menu and menu item onClick fires", async () => {
  const onFinalize = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <SplitButton
      primaryLabel="Check Out"
      onPrimary={vi.fn()}
      items={[{ key: "finalize", label: "Finalize", onClick: onFinalize }]}
    />,
  );

  // Click the ▾ caret ("More actions")
  await user.click(screen.getByRole("button", { name: "More actions" }));

  // Menu item should appear
  const menuItem = await screen.findByRole("menuitem", { name: "Finalize" });
  await user.click(menuItem);
  expect(onFinalize).toHaveBeenCalledTimes(1);
});

test("SplitButton with no items renders no caret", () => {
  renderWithProviders(
    <SplitButton primaryLabel="Check Out" onPrimary={vi.fn()} items={[]} />,
  );
  expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
});

test("SplitButton primary button is disabled when primaryDisabled is true", () => {
  renderWithProviders(
    <SplitButton primaryLabel="Check Out" onPrimary={vi.fn()} items={[]} primaryDisabled />,
  );
  expect(screen.getByRole("button", { name: "Check Out" })).toBeDisabled();
});

test("SplitButton primary button is disabled when primaryLoading is true", () => {
  renderWithProviders(
    <SplitButton primaryLabel="Checking out…" onPrimary={vi.fn()} items={[]} primaryLoading />,
  );
  expect(screen.getByRole("button", { name: "Checking out…" })).toBeDisabled();
});
