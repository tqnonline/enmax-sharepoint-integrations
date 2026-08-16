import { describe, it, expect } from "vitest";
import { applyBroadcastListFilters } from "../../features/broadcasts/broadcastListFilters";
import type { Enmax_autocadbroadcasts } from "../../generated/models/Enmax_autocadbroadcastsModel";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";

const FIXED_NOW = new Date("2026-07-09T12:00:00.000Z");
const DEFAULT = defaultGridDateRange(FIXED_NOW);

const row = (patch: Partial<Enmax_autocadbroadcasts>): Enmax_autocadbroadcasts => ({
  enmax_autocadbroadcastid: "bc-1",
  enmax_acdntitle: "Maintenance window",
  enmax_acdnbody: "Planned outage",
  enmax_acdnstartsat: "2026-06-20T08:00:00Z",
  enmax_acdnexpiresat: "2026-06-21T08:00:00Z",
  enmax_acdnseverity: 1,
  enmax_acdnaudience: 1,
  enmax_acdnpinned: false,
  enmax_acdnstatus: 1,
  ...patch,
});

describe("broadcast list filters", () => {
  it("default 30-day range includes broadcasts that start inside the window", () => {
    const rows = applyBroadcastListFilters(
      [row({})],
      { number: "", from: DEFAULT.from, to: DEFAULT.to },
    );
    expect(rows).toHaveLength(1);
  });

  it("excludes broadcasts outside the date window", () => {
    const rows = applyBroadcastListFilters(
      [row({ enmax_acdnstartsat: "2026-01-01T08:00:00Z" })],
      { number: "", from: DEFAULT.from, to: DEFAULT.to },
    );
    expect(rows).toHaveLength(0);
  });

  it("title/body filter applies only when number is entered", () => {
    const all = applyBroadcastListFilters([row({})], { number: "", from: "", to: "" });
    const hit = applyBroadcastListFilters([row({})], { number: "maintenance", from: "", to: "" });
    const miss = applyBroadcastListFilters([row({})], { number: "holiday", from: "", to: "" });
    expect(all).toHaveLength(1);
    expect(hit).toHaveLength(1);
    expect(miss).toHaveLength(0);
  });
});
