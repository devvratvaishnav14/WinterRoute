import { describe, expect, it } from "vitest";
import { computeExpectedDuration } from "./computeExpectedDuration";
import {
  forecast,
  route,
  segment,
  trafficAnalysis,
  trafficResult,
  transitAnalysis,
  transitSegmentAnalysis,
  weatherAnalysis,
  weatherSample,
} from "@/lib/scoring/fixtures";

const NOW = new Date("2026-09-24T14:00:00Z");

describe("computeExpectedDuration — range invariants", () => {
  it("always satisfies lowerBound <= centralEstimate <= upperBound, lowerBound >= 0, no NaN/Infinity", () => {
    const scenarios = [
      { mode: "drive" as const, weather: { snowfallCm: 8, temperatureC: -5 }, delay: 25 },
      { mode: "walk" as const, weather: { precipitationMm: 15 }, delay: 0 },
      { mode: "drive" as const, weather: {}, delay: 0 },
    ];

    for (const scenario of scenarios) {
      const r = route([segment({ id: "s1", mode: scenario.mode, durationMinutes: 30 })]);
      const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 10, ...scenario.weather })])] });
      const traffic =
        scenario.mode === "drive"
          ? trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: scenario.delay, trafficAwareDurationMinutes: 30 + scenario.delay }) } })
          : trafficResult({ trafficAnalysis: { status: "not-applicable", reason: scenario.mode } });

      const result = computeExpectedDuration({ route: r, weather, traffic, transit: transitAnalysis({ status: "not-applicable", reason: "x" }), now: NOW });

      expect(Number.isNaN(result.centralEstimateMinutes)).toBe(false);
      expect(Number.isFinite(result.centralEstimateMinutes)).toBe(true);
      expect(result.lowerBoundMinutes).toBeGreaterThanOrEqual(0);
      expect(result.lowerBoundMinutes).toBeLessThanOrEqual(result.centralEstimateMinutes);
      expect(result.centralEstimateMinutes).toBeLessThanOrEqual(result.upperBoundMinutes);
    }
  });
});

describe("computeExpectedDuration — counterfactual tests", () => {
  it("CAR: increasing traffic delay from 2 to 15 min never decreases the expected duration", () => {
    const durationFor = (delay: number) => {
      const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
      const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: delay, trafficAwareDurationMinutes: 30 + delay }) } });
      return computeExpectedDuration({ route: r, weather: null, traffic, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: NOW }).centralEstimateMinutes;
    };
    expect(durationFor(15)).toBeGreaterThanOrEqual(durationFor(2));
  });

  it("WEATHER: clear -> heavy snow on a walking route never decreases the upper bound", () => {
    const upperFor = (snowfallCm: number) => {
      const r = route([segment({ id: "s1", mode: "walk", durationMinutes: 40 })]);
      const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ snowfallCm, temperatureC: snowfallCm > 0 ? -2 : 10 })])] });
      return computeExpectedDuration({ route: r, weather, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "walk" }), now: NOW }).upperBoundMinutes;
    };
    expect(upperFor(8)).toBeGreaterThanOrEqual(upperFor(0));
  });

  it("TRANSIT: an on-schedule update -> a +10 min factual delay never decreases the central estimate", () => {
    const centralFor = (delaySeconds: number) => {
      const r = route([segment({ id: "b1", mode: "bus", durationMinutes: 20 })]);
      const transit = transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", arrivalDelaySeconds: delaySeconds } })] });
      return computeExpectedDuration({ route: r, weather: null, traffic: null, transit, now: NOW }).centralEstimateMinutes;
    };
    expect(centralFor(600)).toBeGreaterThanOrEqual(centralFor(0));
  });

  it("CANCELLATION: scheduled -> canceled with no alternative must NOT still show the original precise scheduled duration/status", () => {
    const r = route([segment({ id: "b1", mode: "bus", durationMinutes: 20 })]);

    const scheduled = computeExpectedDuration({
      route: r,
      weather: null,
      traffic: null,
      transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", arrivalDelaySeconds: 0 } })] }),
      now: NOW,
    });
    const canceled = computeExpectedDuration({
      route: r,
      weather: null,
      traffic: null,
      transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "canceled" } })] }),
      now: NOW,
    });

    expect(scheduled.predictionStatus).toBe("available");
    expect(canceled.predictionStatus).toBe("route-disrupted");
    expect(canceled.upperBoundMinutes).toBeGreaterThan(scheduled.upperBoundMinutes);
  });
});

describe("computeExpectedDuration — sanity", () => {
  it("returns 'insufficient-data' with no route/baseline data", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: undefined })], { baselineDurationMinutes: undefined });
    const result = computeExpectedDuration({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: NOW });
    expect(result.predictionStatus).toBe("insufficient-data");
  });

  it("never shows false precision internally — model version and config fingerprint are present and stable", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const a = computeExpectedDuration({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: NOW });
    const b = computeExpectedDuration({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: NOW });
    expect(a.modelVersion).toBe("winterroute-duration-v0");
    expect(a.configFingerprint).toBe(b.configFingerprint);
  });

  it("is deterministic: identical input produces an identical result", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 6, trafficAwareDurationMinutes: 36 }) } });
    const a = computeExpectedDuration({ route: r, weather: null, traffic, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: NOW });
    const b = computeExpectedDuration({ route: r, weather: null, traffic, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: NOW });
    expect(a.centralEstimateMinutes).toBe(b.centralEstimateMinutes);
    expect(a.lowerBoundMinutes).toBe(b.lowerBoundMinutes);
    expect(a.upperBoundMinutes).toBe(b.upperBoundMinutes);
  });
});

describe("computeExpectedDuration — independence from the risk model", () => {
  it("two scenarios can have a similar risk index but a different expected duration, and vice versa", async () => {
    const { computeCommuteRisk } = await import("@/lib/scoring/computeCommuteRisk");

    // Scenario A: heavy snow but zero traffic delay (high weather risk, small duration effect since weather is uncertainty-only for cars).
    const rA = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const weatherA = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ snowfallCm: 8, temperatureC: -6, precipitationMm: 10 })])] });
    const trafficA = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 0, trafficAwareDurationMinutes: 30 }) } });
    const transitStub = transitAnalysis({ status: "not-applicable", reason: "car" });

    // Scenario B: clear weather but a large traffic delay (low weather risk, large duration effect).
    const rB = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const weatherB = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 12, precipitationMm: 0, snowfallCm: 0 })])] });
    const trafficB = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 8, trafficAwareDurationMinutes: 38 }) } });

    const riskA = computeCommuteRisk({ route: rA, weather: weatherA, traffic: trafficA, transit: transitStub, now: NOW });
    const riskB = computeCommuteRisk({ route: rB, weather: weatherB, traffic: trafficB, transit: transitStub, now: NOW });
    const durationA = computeExpectedDuration({ route: rA, weather: weatherA, traffic: trafficA, transit: transitStub, now: NOW });
    const durationB = computeExpectedDuration({ route: rB, weather: weatherB, traffic: trafficB, transit: transitStub, now: NOW });

    // Scenario A should have a higher risk index (severe weather) but a similar or lower central duration than B (no traffic delay).
    expect(riskA.overallIndex).toBeGreaterThan(riskB.overallIndex);
    expect(durationA.centralEstimateMinutes).toBeLessThan(durationB.centralEstimateMinutes);
  });
});
