import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LinkLanding } from "../../app/LinkLanding";

function renderAt(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/link" element={<LinkLanding />} />
        <Route path="/reservations/:id" element={<div>reservation page</div>} />
        <Route path="/approvals" element={<div>approvals page</div>} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LinkLanding", () => {
  it("redirects a valid deep link to the target route", () => {
    renderAt("/link?target=reservation&id=abc-1");
    expect(screen.getByText("reservation page")).toBeInTheDocument();
  });

  it("redirects to home when the deep link is unresolvable", () => {
    renderAt("/link?target=bogus");
    expect(screen.getByText("home page")).toBeInTheDocument();
  });
});
