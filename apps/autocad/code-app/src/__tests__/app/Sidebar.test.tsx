import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "../../app/Sidebar";
import { enmaxLightTheme } from "../../theme/brand";
import { type Role } from "../../auth/useUserRole";

// Mock useUserRole so we control what role the sidebar sees
const mockRole: { value: Role } = { value: "User" };
vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: mockRole.value, isPending: false }),
}));

function renderSidebar() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <FluentProvider theme={enmaxLightTheme}>
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      </FluentProvider>
    </QueryClientProvider>,
  );
}

// Test 8 — Role gating must hide Approvals from User role (not just grey it out)
test("hides Approvals from sidebar for User role — role gating removes, not disables", () => {
  mockRole.value = "User";
  renderSidebar();
  expect(screen.queryByText("Approvals")).not.toBeInTheDocument();
});

// Test 9 — Admin must see all 9 destinations
test("shows all 9 destinations to Admin role", () => {
  mockRole.value = "Admin";
  renderSidebar();
  const destinations = ["Home", "Reserve", "Search", "My Items", "Approvals", "Reference Data", "Audit", "Broadcasts", "Settings"];
  for (const d of destinations) {
    expect(screen.getByText(d)).toBeInTheDocument();
  }
});
