import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateSpy,
}));

let mockQueryParams: Record<string, string> = {};
vi.mock("@microsoft/power-apps/app", () => ({
  getContext: async () => ({ app: { queryParams: mockQueryParams } }),
}));

import { DeepLinkBootstrap } from "../../app/DeepLinkBootstrap";

function renderBootstrap() {
  return render(
    <FluentProvider theme={webLightTheme}>
      <DeepLinkBootstrap>
        <div>child content</div>
      </DeepLinkBootstrap>
    </FluentProvider>,
  );
}

beforeEach(() => {
  navigateSpy.mockClear();
  mockQueryParams = {};
  window.history.replaceState({}, "", "/");
});

describe("DeepLinkBootstrap", () => {
  it("redirects once (replace) to the resolved route from getContext queryParams", async () => {
    mockQueryParams = { target: "reservation", id: "res-42" };
    renderBootstrap();
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/reservations/res-42", { replace: true }),
    );
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("child content")).toBeInTheDocument();
  });

  it("renders children and does not navigate when there is no deep link", async () => {
    renderBootstrap();
    expect(await screen.findByText("child content")).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("falls back to window.location.search when getContext has no target", async () => {
    window.history.replaceState({}, "", "/?target=approvals&section=documents&tab=checkout");
    renderBootstrap();
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith(
        "/approvals?section=documents&tab=checkout",
        { replace: true },
      ),
    );
  });
});
