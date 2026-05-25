import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { DiagnosticsIndicator } from "../../app/DiagnosticsIndicator";
import { setDiagnostics, isDiagnosticsOn } from "../../lib/diagnostics";

beforeEach(() => { sessionStorage.clear(); });

test("renders nothing when diagnostics is off", () => {
  renderWithProviders(<DiagnosticsIndicator />);
  expect(screen.queryByText("Diagnostics on")).not.toBeInTheDocument();
});

test("shows the chip when on and the dismiss button turns it off", async () => {
  const user = userEvent.setup();
  setDiagnostics(true);
  renderWithProviders(<DiagnosticsIndicator />);

  expect(screen.getByText("Diagnostics on")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /turn off diagnostics mode/i }));
  expect(isDiagnosticsOn()).toBe(false);
});
