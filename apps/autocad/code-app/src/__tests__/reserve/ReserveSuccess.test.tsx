import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { ReserveSuccess } from "../../features/reserve/ReserveSuccess";

describe("ReserveSuccess", () => {
  it("shows the reference id and a link to the reservation when id is present", () => {
    renderWithProviders(<ReserveSuccess />, { initialPath: "/reserve/success?id=res-1&ref=GG-CG-00-ECS-AST-DD-0001" });

    expect(screen.getByText("Reservation submitted")).toBeInTheDocument();
    expect(screen.getByText("GG-CG-00-ECS-AST-DD-0001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View reservation" })).toHaveAttribute("href", "/reservations/res-1");
    expect(screen.queryByText(/Appending/)).not.toBeInTheDocument();
  });

  it("shows the append-to-existing context and hides the reservation link when id is absent", () => {
    renderWithProviders(<ReserveSuccess />, { initialPath: "/reserve/success?base=GG-CG-00-ECS-AST-DD-0001&count=3" });

    expect(screen.getByText(/Appending 3 item\(s\) to/)).toBeInTheDocument();
    expect(screen.getByText("GG-CG-00-ECS-AST-DD-0001")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View reservation" })).not.toBeInTheDocument();
  });
});
