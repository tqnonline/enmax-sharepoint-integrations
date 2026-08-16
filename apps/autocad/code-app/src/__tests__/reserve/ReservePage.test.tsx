import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../helpers/renderWithProviders";

vi.mock("../../features/reserve/ReserveWizard", () => ({
  ReserveWizard: () => <div data-testid="reserve-wizard">wizard</div>,
}));

import { ReservePage } from "../../features/reserve/ReservePage";

describe("ReservePage", () => {
  it("renders the page heading and the reserve wizard", async () => {
    renderWithProviders(<ReservePage />);
    expect(screen.getByRole("heading", { name: /Reserve Drawing Numbers & Documents/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("reserve-wizard")).toBeInTheDocument());
  });
});
