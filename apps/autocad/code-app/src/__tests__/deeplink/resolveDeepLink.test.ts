import { describe, it, expect } from "vitest";
import {
  resolveDeepLink,
  buildDeepLinkUrl,
} from "../../lib/deeplink/deeplinkTargets";

describe("resolveDeepLink", () => {
  it.each([
    ["reservation detail", { target: "reservation", id: "abc-123" }, "/reservations/abc-123"],
    ["approvals (no tab)", { target: "approvals" }, "/approvals"],
    ["approvals with section", { target: "approvals", section: "documents" }, "/approvals?section=documents"],
    [
      "approvals with section + tab",
      { target: "approvals", section: "documents", tab: "checkout" },
      "/approvals?section=documents&tab=checkout",
    ],
    ["document detail", { target: "document", id: "doc-9" }, "/search/documents/doc-9"],
    ["my items", { target: "myitems" }, "/my-items"],
  ])("maps %s", (_label, params, expected) => {
    expect(resolveDeepLink(params)).toBe(expected);
  });

  it.each([
    ["no params", undefined],
    ["empty", {}],
    ["unknown target", { target: "nope" }],
    ["reservation missing id", { target: "reservation" }],
    ["document missing id", { target: "document" }],
  ])("returns null for %s", (_label, params) => {
    expect(resolveDeepLink(params as Record<string, string> | undefined)).toBeNull();
  });

  it("ignores empty-string values", () => {
    expect(resolveDeepLink({ target: "reservation", id: "" })).toBeNull();
  });
});

describe("buildDeepLinkUrl", () => {
  it("appends with ? when base has no query", () => {
    expect(buildDeepLinkUrl("https://host/app", "myitems")).toBe(
      "https://host/app?target=myitems",
    );
  });

  it("appends with & when base already has a query", () => {
    expect(
      buildDeepLinkUrl("https://host/app?tenantId=t1", "reservation", { id: "r1" }),
    ).toBe("https://host/app?tenantId=t1&target=reservation&id=r1");
  });

  it.each([
    ["reservation", { id: "res-7" }, "/reservations/res-7"],
    ["approvals", { section: "documents", tab: "checkin" }, "/approvals?section=documents&tab=checkin"],
    ["document", { id: "d-1" }, "/search/documents/d-1"],
  ] as const)("round-trips %s through resolveDeepLink", (target, params, expectedPath) => {
    const url = buildDeepLinkUrl("https://host/app", target, params);
    const query = Object.fromEntries(new URL(url).searchParams.entries());
    expect(resolveDeepLink(query)).toBe(expectedPath);
  });
});
