import { describe, expect, it } from "vitest";
import { computeArriveBy } from "./arriveBy";
import { durationFixture } from "./fixtures";

const NOW = new Date("2026-09-24T14:00:00Z"); // 07:00 PDT

describe("computeArriveBy", () => {
  it("recommends departure using the upper bound: target - upperBound", () => {
    // Arrive 9:00 AM PDT = 16:00 UTC. Expected 55-63 min (upper=63).
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({ baselineDurationMinutes: 43, lowerBoundMinutes: 55, centralEstimateMinutes: 59, upperBoundMinutes: 63 });
    const result = computeArriveBy(duration, target, NOW);
    // 16:00 - 63min = 14:57 UTC.
    expect(result.result?.recommendedDepartureTime).toEqual(new Date("2026-09-24T14:57:00Z"));
  });

  it("computes typicalDeparture from baseline and leaveEarlierByMinutes as the difference", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({ baselineDurationMinutes: 43, lowerBoundMinutes: 55, centralEstimateMinutes: 59, upperBoundMinutes: 63 });
    const result = computeArriveBy(duration, target, NOW);
    // typical = 16:00 - 43min = 15:17. recommended = 14:57. leaveEarlierBy = 20.
    expect(result.result?.typicalDepartureTime).toEqual(new Date("2026-09-24T15:17:00Z"));
    expect(result.result?.leaveEarlierByMinutes).toBe(20);
  });

  it("caps the recommendation at the typical departure — never recommends leaving later than typical", () => {
    // Faster-than-baseline: upperBound (24) < baseline (28).
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({ baselineDurationMinutes: 28, lowerBoundMinutes: 22, centralEstimateMinutes: 24, upperBoundMinutes: 24 });
    const result = computeArriveBy(duration, target, NOW);
    const typical = result.result?.typicalDepartureTime;
    const recommended = result.result?.recommendedDepartureTime;
    expect(recommended?.getTime()).toBeLessThanOrEqual(typical!.getTime());
    expect(recommended).toEqual(typical); // capped exactly to typical, never later
    expect(result.result?.leaveEarlierByMinutes).toBe(0);
  });

  it("never produces a negative leaveEarlierByMinutes", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({ baselineDurationMinutes: 20, lowerBoundMinutes: 5, centralEstimateMinutes: 8, upperBoundMinutes: 10 });
    const result = computeArriveBy(duration, target, NOW);
    expect(result.result?.leaveEarlierByMinutes).toBeGreaterThanOrEqual(0);
  });

  it("floors the recommended departure to the minute (never rounds up)", () => {
    const target = new Date("2026-09-24T16:00:41Z"); // has odd seconds
    const duration = durationFixture({ baselineDurationMinutes: 43, upperBoundMinutes: 63.7 });
    const result = computeArriveBy(duration, target, NOW);
    expect(result.result?.recommendedDepartureTime?.getSeconds()).toBe(0);
    expect(result.result?.recommendedDepartureTime?.getMilliseconds()).toBe(0);
  });

  it("computes the expected arrival window that results from leaving at the recommended time", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({ baselineDurationMinutes: 43, lowerBoundMinutes: 55, centralEstimateMinutes: 59, upperBoundMinutes: 63 });
    const result = computeArriveBy(duration, target, NOW);
    const window = result.result?.expectedArrivalWindowWhenLeavingRecommended;
    expect(window?.upper).toEqual(target); // leaving at target-upperBound + upperBound should land back at target
  });

  it("returns 'insufficient-data' with no recommendation when duration itself is insufficient", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({ predictionStatus: "insufficient-data", statusReasons: ["No baseline route duration is available."] });
    const result = computeArriveBy(duration, target, NOW);
    expect(result.status).toBe("insufficient-data");
    expect(result.result?.recommendedDepartureTime).toBeUndefined();
  });

  it("returns 'route-disrupted' with no confident recommendation when the itinerary is disrupted", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({ predictionStatus: "route-disrupted", statusReasons: ["Trip 145 is canceled."] });
    const result = computeArriveBy(duration, target, NOW);
    expect(result.status).toBe("route-disrupted");
    expect(result.result?.recommendedDepartureTime).toBeUndefined();
  });

  it("still produces a recommendation for 'limited-data', flagged as such", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({ predictionStatus: "limited-data", statusReasons: ["Traffic data is unavailable."], baselineDurationMinutes: 43, upperBoundMinutes: 50 });
    const result = computeArriveBy(duration, target, NOW);
    expect(result.status).toBe("limited-data");
    expect(result.result?.recommendedDepartureTime).toBeDefined();
    expect(result.statusReasons).toContain("Traffic data is unavailable.");
  });

  describe("missed departure window", () => {
    it("is NOT missed when the recommendation is exactly now (avoiding the minute-flooring regression)", () => {
      // Recommended departure computed to land exactly at NOW.
      const target = new Date(NOW.getTime() + 43 * 60_000);
      const duration = durationFixture({ baselineDurationMinutes: 43, upperBoundMinutes: 43 });
      const result = computeArriveBy(duration, target, NOW);
      expect(result.status).not.toBe("departure-window-missed");
    });

    it("is NOT missed when the recommendation is one minute in the future", () => {
      const target = new Date(NOW.getTime() + 44 * 60_000);
      const duration = durationFixture({ baselineDurationMinutes: 43, upperBoundMinutes: 43 });
      const result = computeArriveBy(duration, target, NOW);
      expect(result.status).not.toBe("departure-window-missed");
    });

    it("IS missed when the recommendation is in the past", () => {
      const target = new Date(NOW.getTime() + 10 * 60_000); // only 10 min away, but trip takes 43
      const duration = durationFixture({ baselineDurationMinutes: 43, upperBoundMinutes: 43 });
      const result = computeArriveBy(duration, target, NOW);
      expect(result.status).toBe("departure-window-missed");
    });

    it("provides a 'leave now' expected arrival range when the analysis is recent", () => {
      const target = new Date(NOW.getTime() + 10 * 60_000);
      const duration = durationFixture({ baselineDurationMinutes: 43, lowerBoundMinutes: 40, centralEstimateMinutes: 43, upperBoundMinutes: 46, analyzedAt: new Date(NOW.getTime() - 2 * 60_000) });
      const result = computeArriveBy(duration, target, NOW);
      expect(result.result?.leaveNowAnalysisStale).toBe(false);
      expect(result.result?.leaveNowExpectedArrivalRange).toBeDefined();
      expect(result.result?.leaveNowExpectedArrivalRange?.upper).toEqual(new Date(NOW.getTime() + 46 * 60_000));
    });

    it("withholds the 'leave now' range and flags staleness when the analysis is old", () => {
      const target = new Date(NOW.getTime() + 10 * 60_000);
      const duration = durationFixture({ baselineDurationMinutes: 43, upperBoundMinutes: 46, analyzedAt: new Date(NOW.getTime() - 30 * 60_000) });
      const result = computeArriveBy(duration, target, NOW);
      expect(result.result?.leaveNowAnalysisStale).toBe(true);
      expect(result.result?.leaveNowExpectedArrivalRange).toBeUndefined();
    });
  });

  describe("midnight and timezone", () => {
    it("correctly computes a recommended departure on the previous calendar day", () => {
      // Arrive 12:15 AM PDT (2026-09-25) = 2026-09-25T07:15:00Z. Expected 45-60 min (upper=60).
      const target = new Date("2026-09-25T07:15:00Z");
      const duration = durationFixture({ baselineDurationMinutes: 50, lowerBoundMinutes: 45, centralEstimateMinutes: 52, upperBoundMinutes: 60 });
      const result = computeArriveBy(duration, target, new Date("2026-09-24T20:00:00Z"));
      // 07:15 - 60min = 06:15 UTC same date = 2026-09-24T23:15 PDT (previous calendar day locally).
      expect(result.result?.recommendedDepartureTime).toEqual(new Date("2026-09-25T06:15:00Z"));
    });
  });

  describe("DST transitions", () => {
    it("handles a departure computed across the spring-forward transition correctly (pure epoch arithmetic, not clock-string math)", () => {
      // PDT begins 2026-03-08 (spring forward). Arrive 3:30 AM PDT on 2026-03-08.
      const target = new Date("2026-03-08T10:30:00Z"); // 2:30 AM PST equivalent instant before the jump
      const duration = durationFixture({ baselineDurationMinutes: 90, upperBoundMinutes: 90 });
      const result = computeArriveBy(duration, target, new Date("2026-03-07T12:00:00Z"));
      // Recommended = target - 90 min, purely in absolute time — always exact regardless of the DST boundary it crosses.
      expect(result.result?.recommendedDepartureTime?.getTime()).toBe(target.getTime() - 90 * 60_000);
    });

    it("handles a departure computed across the fall-back transition correctly", () => {
      // PST begins 2026-11-01 (fall back).
      const target = new Date("2026-11-01T10:30:00Z");
      const duration = durationFixture({ baselineDurationMinutes: 90, upperBoundMinutes: 90 });
      const result = computeArriveBy(duration, target, new Date("2026-10-31T12:00:00Z"));
      expect(result.result?.recommendedDepartureTime?.getTime()).toBe(target.getTime() - 90 * 60_000);
    });
  });
});
