import { describe, it, expect } from "vitest";
import {
  greeting,
  firstName,
  audienceTargetsRole,
  isBroadcastActive,
  broadcastSeverityIntent,
} from "../../features/home/homeUtils";

describe("greeting", () => {
  it("is time-of-day aware", () => {
    expect(greeting(8)).toBe("Good morning");
    expect(greeting(13)).toBe("Good afternoon");
    expect(greeting(20)).toBe("Good evening");
  });
});

describe("firstName", () => {
  it("takes the first token", () => {
    expect(firstName("Rahul Akmol")).toBe("Rahul");
  });
  it("falls back to 'there' when empty", () => {
    expect(firstName(undefined)).toBe("there");
    expect(firstName("   ")).toBe("there");
  });
});

describe("audienceTargetsRole", () => {
  it("Everyone targets all roles", () => {
    expect(audienceTargetsRole("4", "User")).toBe(true);
    expect(audienceTargetsRole("4", "Admin")).toBe(true);
  });
  it("matches a specific role value", () => {
    expect(audienceTargetsRole("2", "Approver")).toBe(true);
    expect(audienceTargetsRole("1,3", "Admin")).toBe(true);
    expect(audienceTargetsRole("1,3", "Approver")).toBe(false);
  });
  it("empty audience targets no one", () => {
    expect(audienceTargetsRole(undefined, "Admin")).toBe(false);
    expect(audienceTargetsRole("", "Admin")).toBe(false);
  });
});

describe("isBroadcastActive", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");
  it("active when now is within the window and not retired", () => {
    expect(isBroadcastActive(
      { enmax_acdnstartsat: "2026-05-31T00:00:00Z", enmax_acdnexpiresat: "2026-06-02T00:00:00Z", statecode: 0 },
      now,
    )).toBe(true);
  });
  it("inactive before start, after expiry, when retired, or deactivated", () => {
    expect(isBroadcastActive({ enmax_acdnstartsat: "2026-06-02T00:00:00Z", enmax_acdnexpiresat: "2026-06-03T00:00:00Z", statecode: 0 }, now)).toBe(false);
    expect(isBroadcastActive({ enmax_acdnstartsat: "2026-05-01T00:00:00Z", enmax_acdnexpiresat: "2026-05-02T00:00:00Z", statecode: 0 }, now)).toBe(false);
    expect(isBroadcastActive({ enmax_acdnstartsat: "2026-05-31T00:00:00Z", enmax_acdnexpiresat: "2026-06-02T00:00:00Z", enmax_acdnstatus: 5, statecode: 0 }, now)).toBe(false);
    expect(isBroadcastActive({ enmax_acdnstartsat: "2026-05-31T00:00:00Z", enmax_acdnexpiresat: "2026-06-02T00:00:00Z", statecode: 1 }, now)).toBe(false);
  });
});

describe("broadcastSeverityIntent", () => {
  it("maps severity values to Fluent intents", () => {
    expect(broadcastSeverityIntent(1)).toBe("info");
    expect(broadcastSeverityIntent(2)).toBe("warning");
    expect(broadcastSeverityIntent(3)).toBe("error");
  });
});
