import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { EnvironmentBadge } from "../../components/EnvironmentBadge";
import { VALID_CONFIG } from "../msw/handlers";

const mockConfig = { ...VALID_CONFIG, EnvironmentBadge: "Production" };

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => mockConfig,
}));

beforeEach(() => {
  mockConfig.EnvironmentBadge = "Production";
});

describe("EnvironmentBadge", () => {
  test("renders nothing on Production", () => {
    mockConfig.EnvironmentBadge = "Production";
    const { container } = render(<EnvironmentBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders SANDBOX chip when configured", () => {
    mockConfig.EnvironmentBadge = "Sandbox";
    render(<EnvironmentBadge />);
    expect(screen.getByTestId("environment-badge")).toHaveTextContent("SANDBOX");
    expect(screen.getByLabelText("Environment: SANDBOX")).toBeInTheDocument();
  });
});
