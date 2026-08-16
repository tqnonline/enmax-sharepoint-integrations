import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FluentProvider } from "@fluentui/react-components";
import { enmaxLightTheme } from "../../theme/brand";
import { RequireRole } from "../../auth/RequireRole";
import { type Role } from "../../auth/useUserRole";

const mockRole: { value: Role } = { value: "User" };
vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => mockRole.value,
}));

function renderGuarded(initialPath: string) {
  return render(
    <FluentProvider theme={enmaxLightTheme}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/approvals"
            element={
              <RequireRole roles={["Approver", "Admin"]}>
                <div>Approvals content</div>
              </RequireRole>
            }
          />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    </FluentProvider>,
  );
}

// Test 15 — Defence-in-depth: a User navigating directly to /approvals must be redirected
test("redirects User attempting to navigate directly to /approvals — defence-in-depth", () => {
  mockRole.value = "User";
  renderGuarded("/approvals");
  expect(screen.queryByText("Approvals content")).not.toBeInTheDocument();
  expect(screen.getByText("Home")).toBeInTheDocument();
});
