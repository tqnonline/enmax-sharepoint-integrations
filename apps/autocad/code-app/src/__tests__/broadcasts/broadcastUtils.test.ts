import { describe, it, expect } from "vitest";
import {
  validateBroadcast, computeDisplayStatus, audienceToCsv, csvToAudience, audienceLabels,
} from "../../features/broadcasts/broadcastUtils";

const OK = {
  title: "Maintenance window",
  body: "We will be down Sunday 2-4am MT.",
  audience: [4],
  startsAt: "2026-06-01T00:00",
  expiresAt: "2026-06-08T00:00",
};

describe("validateBroadcast", () => {
  it("passes a valid broadcast", () => expect(validateBroadcast(OK)).toEqual({}));
  it("rejects a too-short title and body", () => {
    expect(validateBroadcast({ ...OK, title: "Hi" }).title).toBeTruthy();
    expect(validateBroadcast({ ...OK, body: "short" }).body).toBeTruthy();
  });
  it("requires at least one audience", () => expect(validateBroadcast({ ...OK, audience: [] }).audience).toBeTruthy());
  it("requires expiry after start", () =>
    expect(validateBroadcast({ ...OK, expiresAt: "2026-05-01T00:00" }).expiresAt).toBeTruthy());
});

describe("computeDisplayStatus", () => {
  const now = Date.parse("2026-06-05T12:00:00Z");
  it("Retired when stored status is Retired", () =>
    expect(computeDisplayStatus({ enmax_acdnstatus: 5 }, now)).toBe("Retired"));
  it("Active within the window", () =>
    expect(computeDisplayStatus({ enmax_acdnstartsat: "2026-06-01T00:00:00Z", enmax_acdnexpiresat: "2026-06-10T00:00:00Z" }, now)).toBe("Active"));
  it("Scheduled before start", () =>
    expect(computeDisplayStatus({ enmax_acdnstartsat: "2026-06-10T00:00:00Z", enmax_acdnexpiresat: "2026-06-20T00:00:00Z" }, now)).toBe("Scheduled"));
  it("Expired after expiry", () =>
    expect(computeDisplayStatus({ enmax_acdnstartsat: "2026-05-01T00:00:00Z", enmax_acdnexpiresat: "2026-05-10T00:00:00Z" }, now)).toBe("Expired"));
});

describe("audience csv", () => {
  it("round-trips and sorts", () => {
    expect(audienceToCsv([4, 1])).toBe("1,4");
    expect(csvToAudience("1,4")).toEqual([1, 4]);
  });
  it("renders labels", () => expect(audienceLabels("1,4")).toBe("Users, Everyone"));
});
