import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { enmaxLightTheme } from "../../theme/brand";
import { MaintenanceBanner } from "../../app/MaintenanceBanner";
import { VALID_CONFIG } from "../msw/handlers";

const mockConfig = { ...VALID_CONFIG };
vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => mockConfig,
}));

function renderBanner() {
  return render(
    <FluentProvider theme={enmaxLightTheme}>
      <MaintenanceBanner />
    </FluentProvider>,
  );
}

// Test 10 — Banner must render null when SingleAdminMode=false; showing it always would alarm users
test("renders no banner content when SingleAdminMode is false", () => {
  mockConfig.SingleAdminMode = false;
  renderBanner();
  // Banner title must NOT appear — FluentProvider wrapper exists but banner body doesn't
  expect(screen.queryByText(VALID_CONFIG.MaintenanceBannerTitle)).not.toBeInTheDocument();
});

// Test 11 — No dismiss button — banner must remain until admin clears it via config
test("renders banner without a dismiss/close button — non-dismissible by design", () => {
  mockConfig.SingleAdminMode = true;
  renderBanner();
  expect(screen.getByText(VALID_CONFIG.MaintenanceBannerTitle)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /dismiss|close/i })).not.toBeInTheDocument();
});
