import { describe, expect, test } from "vitest";
import { resolveEnvironmentBadgeLabel } from "../../config/environmentBadge";

describe("resolveEnvironmentBadgeLabel", () => {
  test("hides Production / Prod / blank so the live org never shows a chip", () => {
    expect(resolveEnvironmentBadgeLabel("Production")).toBeNull();
    expect(resolveEnvironmentBadgeLabel("production")).toBeNull();
    expect(resolveEnvironmentBadgeLabel("PROD")).toBeNull();
    expect(resolveEnvironmentBadgeLabel("Prod")).toBeNull();
    expect(resolveEnvironmentBadgeLabel("")).toBeNull();
    expect(resolveEnvironmentBadgeLabel("   ")).toBeNull();
    expect(resolveEnvironmentBadgeLabel(undefined)).toBeNull();
    expect(resolveEnvironmentBadgeLabel(null)).toBeNull();
  });

  test("shows non-production labels uppercased for the header chip", () => {
    expect(resolveEnvironmentBadgeLabel("Sandbox")).toBe("SANDBOX");
    expect(resolveEnvironmentBadgeLabel("sandbox")).toBe("SANDBOX");
    expect(resolveEnvironmentBadgeLabel("DEV")).toBe("DEV");
    expect(resolveEnvironmentBadgeLabel("uat")).toBe("UAT");
  });
});
