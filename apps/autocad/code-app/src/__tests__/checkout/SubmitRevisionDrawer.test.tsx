import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { SubmitRevisionDrawer } from "../../features/checkout/components/SubmitRevisionDrawer";

// useAppConfig is mocked globally in test-setup.ts with
// CheckInUploadLibraryUrl = "https://example.com/library".
vi.mock("../../features/checkout/hooks/useSubmitRevision", () => ({
  useSubmitRevision: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }),
}));

test("check-in drawer shows the configured upload library link, opening in a new tab", () => {
  renderWithProviders(<SubmitRevisionDrawer checkoutId="c1" drawingId="d1" currentRevision="A" />);

  fireEvent.click(screen.getByRole("button", { name: /check in/i }));

  const link = screen.getByRole("link", { name: /upload drawings to sharepoint/i });
  expect(link).toHaveAttribute("href", "https://example.com/library");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
