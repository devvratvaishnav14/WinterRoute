import { describe, expect, it } from "vitest";
import { computeTimingRecommendation } from "./computeTimingRecommendation";
import { durationFixture } from "./fixtures";

const NOW = new Date("2026-09-24T14:00:00Z");

describe("computeTimingRecommendation", () => {
  it("routes to Arrive-By logic for preference 'arriveBy'", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const result = computeTimingRecommendation({ duration: durationFixture(), preference: "arriveBy", targetTime: target, now: NOW });
    expect(result.arriveBy).toBeDefined();
    expect(result.leaveAt).toBeUndefined();
  });

  it("routes to Leave-At logic for preference 'leaveAt'", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const result = computeTimingRecommendation({ duration: durationFixture(), preference: "leaveAt", targetTime: target, now: NOW });
    expect(result.leaveAt).toBeDefined();
    expect(result.arriveBy).toBeUndefined();
  });

  it("has its own model version and config fingerprint, distinct from the duration model's", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const result = computeTimingRecommendation({ duration: durationFixture(), preference: "arriveBy", targetTime: target, now: NOW });
    expect(result.modelVersion).toBe("winterroute-timing-v0");
    expect(result.configFingerprint).toMatch(/^[0-9a-f]+$/);
    expect(result.durationPredictionReference.modelVersion).toBe("winterroute-duration-v0");
  });

  it("preserves a trimmed duration reference, not the full duration object", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({ baselineDurationMinutes: 43, upperBoundMinutes: 60 });
    const result = computeTimingRecommendation({ duration, preference: "arriveBy", targetTime: target, now: NOW });
    expect(result.durationPredictionReference.baselineDurationMinutes).toBe(43);
    expect(result.durationPredictionReference.upperBoundMinutes).toBe(60);
    expect(result).not.toHaveProperty("features");
  });
});

describe("computeTimingRecommendation — independence from the risk index", () => {
  it("the function signature accepts no risk score at all, and identical duration+preference+target+now always produces identical timing output", async () => {
    const { computeCommuteRisk } = await import("@/lib/scoring/computeCommuteRisk");
    const { forecast, route, segment, trafficAnalysis, trafficResult, transitAnalysis, weatherAnalysis, weatherSample } = await import("@/lib/scoring/fixtures");

    const r1 = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const clearWeather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 15, precipitationMm: 0, snowfallCm: 0 })])] });
    const severeWeather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: -6, precipitationMm: 14, snowfallCm: 10 })])] });
    const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 0 }) } });
    const transit = transitAnalysis({ status: "not-applicable", reason: "car" });

    // Two wildly different risk indices for the SAME route.
    const lowRisk = computeCommuteRisk({ route: r1, weather: clearWeather, traffic, transit, now: NOW });
    const highRisk = computeCommuteRisk({ route: r1, weather: severeWeather, traffic, transit, now: NOW });
    expect(highRisk.overallIndex).toBeGreaterThan(lowRisk.overallIndex + 20); // confirm they're genuinely different

    // The SAME duration fixture, regardless of which risk was computed.
    const duration = durationFixture({ baselineDurationMinutes: 43, lowerBoundMinutes: 55, centralEstimateMinutes: 59, upperBoundMinutes: 63 });
    const target = new Date("2026-09-24T16:00:00Z");

    const timingA = computeTimingRecommendation({ duration, preference: "arriveBy", targetTime: target, now: NOW });
    const timingB = computeTimingRecommendation({ duration, preference: "arriveBy", targetTime: target, now: NOW });

    // Identical timing output regardless of the (unused, unreferenced) risk computations above.
    expect(timingA.arriveBy?.recommendedDepartureTime).toEqual(timingB.arriveBy?.recommendedDepartureTime);
    expect(timingA.arriveBy?.leaveEarlierByMinutes).toBe(timingB.arriveBy?.leaveEarlierByMinutes);
  });
});

describe("computeTimingRecommendation — counterfactual tests", () => {
  it("ARRIVE BY: a wider expected-duration range never produces a LATER recommended departure", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const narrow = computeTimingRecommendation({ duration: durationFixture({ baselineDurationMinutes: 43, lowerBoundMinutes: 40, centralEstimateMinutes: 45, upperBoundMinutes: 50 }), preference: "arriveBy", targetTime: target, now: NOW });
    const wide = computeTimingRecommendation({ duration: durationFixture({ baselineDurationMinutes: 43, lowerBoundMinutes: 40, centralEstimateMinutes: 55, upperBoundMinutes: 70 }), preference: "arriveBy", targetTime: target, now: NOW });
    expect(wide.arriveBy!.recommendedDepartureTime!.getTime()).toBeLessThanOrEqual(narrow.arriveBy!.recommendedDepartureTime!.getTime());
  });

  it("ARRIVE BY: a shorter baseline changes the leaveEarlierBy comparison correctly", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const longerBaseline = computeTimingRecommendation({ duration: durationFixture({ baselineDurationMinutes: 60, upperBoundMinutes: 63 }), preference: "arriveBy", targetTime: target, now: NOW });
    const shorterBaseline = computeTimingRecommendation({ duration: durationFixture({ baselineDurationMinutes: 45, upperBoundMinutes: 63 }), preference: "arriveBy", targetTime: target, now: NOW });
    // Same upper bound, but a shorter baseline means MORE "leave earlier by" minutes (bigger gap between typical and recommended).
    expect(shorterBaseline.arriveBy!.leaveEarlierByMinutes!).toBeGreaterThan(longerBaseline.arriveBy!.leaveEarlierByMinutes!);
  });

  it("LEAVE AT: a longer expected duration produces a later expected arrival", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const shorter = computeTimingRecommendation({ duration: durationFixture({ centralEstimateMinutes: 40, upperBoundMinutes: 45 }), preference: "leaveAt", targetTime: target, now: NOW });
    const longer = computeTimingRecommendation({ duration: durationFixture({ centralEstimateMinutes: 60, upperBoundMinutes: 65 }), preference: "leaveAt", targetTime: target, now: NOW });
    expect(longer.leaveAt!.expectedArrivalCentral!.getTime()).toBeGreaterThan(shorter.leaveAt!.expectedArrivalCentral!.getTime());
  });
});

describe("computeTimingRecommendation — explanation", () => {
  it("mentions the recommended departure time and baseline/range for Arrive By in summarySentences, not explanation", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const result = computeTimingRecommendation({ duration: durationFixture({ baselineDurationMinutes: 43, lowerBoundMinutes: 55, centralEstimateMinutes: 59, upperBoundMinutes: 63 }), preference: "arriveBy", targetTime: target, now: NOW });
    expect(result.summarySentences.some((s) => s.includes("43"))).toBe(true);
  });

  it("collapses an equal lower/upper bound in the summary sentence instead of saying 'X-X min'", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const result = computeTimingRecommendation({ duration: durationFixture({ baselineDurationMinutes: 14, lowerBoundMinutes: 14, centralEstimateMinutes: 14, upperBoundMinutes: 14 }), preference: "arriveBy", targetTime: target, now: NOW });
    expect(result.summarySentences.some((s) => s.includes("14-14"))).toBe(false);
  });

  it("says 'usual departure timing should be sufficient' when there's nothing to leave earlier for", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const result = computeTimingRecommendation({ duration: durationFixture({ baselineDurationMinutes: 28, lowerBoundMinutes: 22, centralEstimateMinutes: 24, upperBoundMinutes: 24 }), preference: "arriveBy", targetTime: target, now: NOW });
    expect(result.summarySentences.some((s) => s.includes("usual departure timing should be sufficient"))).toBe(true);
  });

  it("includes the dominant duration contribution's own explanation text in `explanation`, not `summarySentences`", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({
      baselineDurationMinutes: 30,
      upperBoundMinutes: 38,
      contributingDelayFactors: [
        { key: "carTrafficTiming", label: "Traffic-aware timing", centralMinutes: 8, lowerMinutes: 8, upperMinutes: 8, provenance: "observed-provider", explanation: "Google's traffic-aware routing currently adds about 8 min compared with the reference duration.", appliesTo: "drive" },
      ],
    });
    const result = computeTimingRecommendation({ duration, preference: "arriveBy", targetTime: target, now: NOW });
    expect(result.explanation).toContain("Google's traffic-aware routing currently adds about 8 min compared with the reference duration.");
    expect(result.summarySentences).not.toContain("Google's traffic-aware routing currently adds about 8 min compared with the reference duration.");
  });

  it("never includes forecast-horizon widening in the user-facing `explanation` reasons", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({
      baselineDurationMinutes: 30,
      upperBoundMinutes: 35,
      contributingDelayFactors: [
        { key: "forecastHorizon", label: "Forecast horizon", centralMinutes: 0, lowerMinutes: 0, upperMinutes: 5, provenance: "heuristic-v0", explanation: "This trip is 2 hours out — the upper end of the estimate allows a little more room the farther out a trip is.", appliesTo: "route" },
      ],
    });
    const result = computeTimingRecommendation({ duration, preference: "arriveBy", targetTime: target, now: NOW });
    expect(result.explanation.some((s) => s.includes("hours out"))).toBe(false);
  });

  it("uses 'around' wording, not 'between X and X', when a Leave-At arrival range collapses to one time", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const result = computeTimingRecommendation({ duration: durationFixture({ baselineDurationMinutes: 14, lowerBoundMinutes: 14, centralEstimateMinutes: 14, upperBoundMinutes: 14 }), preference: "leaveAt", targetTime: target, now: NOW });
    expect(result.summarySentences.some((s) => s.includes("around"))).toBe(true);
    expect(result.summarySentences.some((s) => /between .+ and .+\./.test(s))).toBe(false);
  });

  it("uses 'between X and Y' wording for a genuine Leave-At arrival range", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const result = computeTimingRecommendation({ duration: durationFixture({ baselineDurationMinutes: 14, lowerBoundMinutes: 18, centralEstimateMinutes: 21, upperBoundMinutes: 24 }), preference: "leaveAt", targetTime: target, now: NOW });
    expect(result.summarySentences.some((s) => s.includes("between"))).toBe(true);
  });

  it("puts an uncertainty note (no realtime update yet) in `notes`, not `explanation`", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({
      baselineDurationMinutes: 30,
      upperBoundMinutes: 33,
      contributingDelayFactors: [
        { key: "transitScheduleOnly-seg1", label: "No realtime update yet", centralMinutes: 0, lowerMinutes: 0, upperMinutes: 3, provenance: "heuristic-v0", explanation: "Bus 145 has no realtime update yet — the schedule is used as the best available estimate.", appliesTo: "bus" },
      ],
    });
    const result = computeTimingRecommendation({ duration, preference: "arriveBy", targetTime: target, now: NOW });
    expect(result.notes).toContain("Bus 145 has no realtime update yet — the schedule is used as the best available estimate.");
    expect(result.explanation).not.toContain("Bus 145 has no realtime update yet — the schedule is used as the best available estimate.");
  });

  it("puts a real active service alert in `explanation` (a genuine reason), not `notes`", () => {
    const target = new Date("2026-09-24T16:00:00Z");
    const duration = durationFixture({
      baselineDurationMinutes: 30,
      upperBoundMinutes: 35,
      contributingDelayFactors: [
        { key: "transitAlert-seg1", label: "Service alert", centralMinutes: 0, lowerMinutes: 0, upperMinutes: 5, provenance: "heuristic-v0", explanation: "A TransLink service alert affects Bus 145 without a quantified delay figure — the upper end of the estimate allows for it.", appliesTo: "bus" },
      ],
    });
    const result = computeTimingRecommendation({ duration, preference: "arriveBy", targetTime: target, now: NOW });
    expect(result.explanation).toContain("A TransLink service alert affects Bus 145 without a quantified delay figure — the upper end of the estimate allows for it.");
    expect(result.notes).toEqual([]);
  });
});
