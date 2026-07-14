import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRetinaDisplay, RETINA_MEDIA_QUERY } from "../../lib/useRetinaDisplay";

function mockMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("device-pixel-ratio") || query.includes("min-resolution") ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("useRetinaDisplay", () => {
  const originalDpr = window.devicePixelRatio;

  beforeEach(() => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: originalDpr,
    });
    vi.restoreAllMocks();
  });

  it("returns true when devicePixelRatio >= 2", () => {
    window.matchMedia = mockMatchMedia(true);
    const { result } = renderHook(() => useRetinaDisplay());
    expect(result.current).toBe(true);
  });

  it("returns false on standard 1× displays", () => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 1,
    });
    window.matchMedia = mockMatchMedia(false);
    const { result } = renderHook(() => useRetinaDisplay());
    expect(result.current).toBe(false);
  });

  it("exports a Retina media query string", () => {
    expect(RETINA_MEDIA_QUERY).toContain("device-pixel-ratio");
    expect(RETINA_MEDIA_QUERY).toContain("min-resolution");
  });
});
