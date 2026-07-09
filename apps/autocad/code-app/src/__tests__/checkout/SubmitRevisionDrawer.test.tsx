import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { SubmitRevisionDrawer } from "../../features/checkout/components/SubmitRevisionDrawer";

// useAppConfig is mocked globally in test-setup.ts with
// DrawingsDropOffLibraryUrl = "https://example.com/drawings-dropoff".
vi.mock("../../features/checkout/hooks/useSubmitRevision", () => ({
  useSubmitRevision: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }),
}));

test("check-in opens a modal with embedded SharePoint library and new-tab fallback", () => {
  renderWithProviders(<SubmitRevisionDrawer checkoutId="c1" drawingId="d1" drawingNumber="GG-CG-00-ECS-AST-DD-0001" />);

  fireEvent.click(screen.getByRole("button", { name: /^check in$/i }));

  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText(/check in — gg-cg-00-ecs-ast-dd-0001/i)).toBeInTheDocument();

  const frame = screen.getByTitle(/sharepoint drop-off library/i);
  expect(frame).toHaveAttribute(
    "src",
    "https://example.com/drawings-dropoff/Forms/AllItems.aspx?env=WebViewList",
  );

  const link = screen.getByRole("link", { name: /open library in new tab/i });
  expect(link).toHaveAttribute("href", "https://example.com/drawings-dropoff/Forms/AllItems.aspx");
  expect(link).toHaveAttribute("target", "_blank");
});
