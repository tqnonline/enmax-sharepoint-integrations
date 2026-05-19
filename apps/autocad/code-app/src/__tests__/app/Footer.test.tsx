import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { enmaxLightTheme } from "../../theme/brand";
import { Footer } from "../../app/Footer";
import { VALID_CONFIG } from "../msw/handlers";

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => ({ ...VALID_CONFIG }),
}));
vi.mock("../../lib/version", () => ({
  APP_VERSION: "1.2.3",
  APP_BUILD_DATE: "2026-05-18",
}));

// Test 14 — Footer A17 acceptance criterion: version + date + disclaimer + copyright all present
test("renders version, build date, disclaimer, and copyright — A17 acceptance criterion", () => {
  render(
    <FluentProvider theme={enmaxLightTheme}>
      <Footer />
    </FluentProvider>,
  );
  expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument();
  expect(screen.getByText("2026-05-18")).toBeInTheDocument();
  expect(screen.getByText(VALID_CONFIG.FooterDisclaimer)).toBeInTheDocument();
  expect(screen.getByText(VALID_CONFIG.FooterCopyright)).toBeInTheDocument();
});
