import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { SubmitRevisionDrawer } from "../../features/checkout/components/SubmitRevisionDrawer";

// useAppConfig is mocked globally in test-setup.ts with
// DrawingsDropOffLibraryUrl = "https://example.com/drawings-dropoff"
// and DocumentsDropOffLibraryUrl when set.
vi.mock("../../features/checkout/hooks/useSubmitRevision", () => ({
  useSubmitRevision: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }),
}));

test("check-in opens a modal with a prominent drop-off library link (no iframe)", () => {
  renderWithProviders(<SubmitRevisionDrawer checkoutId="c1" drawingId="d1" drawingNumber="GG-CG-00-ECS-AST-DD-0001" />);

  fireEvent.click(screen.getByRole("button", { name: /^check in$/i }));

  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText(/check in — gg-cg-00-ecs-ast-dd-0001/i)).toBeInTheDocument();
  expect(screen.queryByTitle(/sharepoint drop-off library/i)).not.toBeInTheDocument();

  const openBtn = screen.getByRole("link", { name: /open drop-off library/i });
  expect(openBtn).toHaveAttribute("href", "https://example.com/drawings-dropoff/Forms/AllItems.aspx");
  expect(openBtn).toHaveAttribute("target", "_blank");
  expect(screen.getByText(/GG-CG-00-ECS-AST-DD-0001\.pdf/)).toBeInTheDocument();
});

test("document check-in uses the documents drop-off site", () => {
  renderWithProviders(
    <SubmitRevisionDrawer
      checkoutId="c1"
      drawingId="d1"
      drawingNumber="GG-CG-00-ECS-AST-DD-0002"
      site="documents"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /^check in$/i }));

  const openBtn = screen.getByRole("link", { name: /open drop-off library/i });
  expect(openBtn).toHaveAttribute("href", "https://example.com/documents-dropoff/Forms/AllItems.aspx");
  expect(openBtn).toHaveAttribute("target", "_blank");
});
