import { describe, expect, it } from "vitest";
import { buildTemporalFeatures } from "./temporalFeatures";
import { route, segment } from "./fixtures";

describe("buildTemporalFeatures", () => {
  it("extracts hour/weekday from the route's own start time", () => {
    // 2026-09-24T15:00:00Z is 08:00 PDT, a Thursday.
    const r = route([segment({ startTime: new Date("2026-09-24T15:00:00Z"), endTime: new Date("2026-09-24T15:30:00Z") })]);
    const result = buildTemporalFeatures(r, new Date("2026-09-24T10:00:00Z"));
    expect(result.hourOfDay).toBe(8);
    expect(result.weekday).toBe("thursday");
    expect(result.isWeekend).toBe(false);
  });

  it("flags weekend correctly", () => {
    // 2026-09-26T15:00:00Z is a Saturday.
    const r = route([segment({ startTime: new Date("2026-09-26T15:00:00Z"), endTime: new Date("2026-09-26T15:30:00Z") })]);
    const result = buildTemporalFeatures(r, new Date("2026-09-26T10:00:00Z"));
    expect(result.weekday).toBe("saturday");
    expect(result.isWeekend).toBe(true);
  });

  it("flags weekday morning rush hour", () => {
    // 08:00 PDT Thursday.
    const r = route([segment({ startTime: new Date("2026-09-24T15:00:00Z"), endTime: new Date("2026-09-24T15:30:00Z") })]);
    const result = buildTemporalFeatures(r, new Date("2026-09-24T10:00:00Z"));
    expect(result.isLikelyRushHour).toBe(true);
  });

  it("does not flag rush hour on a weekend even at a rush-hour-like time", () => {
    // 08:00 PDT Saturday.
    const r = route([segment({ startTime: new Date("2026-09-26T15:00:00Z"), endTime: new Date("2026-09-26T15:30:00Z") })]);
    const result = buildTemporalFeatures(r, new Date("2026-09-26T10:00:00Z"));
    expect(result.isLikelyRushHour).toBe(false);
  });

  it("does not flag rush hour at midday", () => {
    // 13:00 PDT Thursday.
    const r = route([segment({ startTime: new Date("2026-09-24T20:00:00Z"), endTime: new Date("2026-09-24T20:30:00Z") })]);
    const result = buildTemporalFeatures(r, new Date("2026-09-24T10:00:00Z"));
    expect(result.isLikelyRushHour).toBe(false);
  });

  it("computes forecast horizon in hours", () => {
    const r = route([segment({ startTime: new Date("2026-09-24T20:00:00Z"), endTime: new Date("2026-09-24T20:30:00Z") })]);
    const result = buildTemporalFeatures(r, new Date("2026-09-24T15:00:00Z"));
    expect(result.forecastHorizonHours).toBeCloseTo(5, 5);
  });

  it("computes transport composition by duration share", () => {
    const r = route([
      segment({ id: "s1", mode: "walk", durationMinutes: 10 }),
      segment({ id: "s2", mode: "bus", durationMinutes: 30 }),
    ]);
    const result = buildTemporalFeatures(r);
    const walk = result.transportComposition.find((c) => c.mode === "walk");
    const bus = result.transportComposition.find((c) => c.mode === "bus");
    expect(walk?.durationShare).toBeCloseTo(0.25, 5);
    expect(bus?.durationShare).toBeCloseTo(0.75, 5);
  });

  it("preserves the baseline duration and segment count", () => {
    const r = route([segment({ durationMinutes: 20 })], { baselineDurationMinutes: 20 });
    const result = buildTemporalFeatures(r);
    expect(result.baselineDurationMinutes).toBe(20);
    expect(result.segmentCount).toBe(1);
  });
});
