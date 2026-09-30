import { describe, expect, it } from "vitest";
import { computeCommuteRisk } from "@/lib/scoring/computeCommuteRisk";
import { forecast, route, segment, trafficResult, transitAnalysis, weatherAnalysis, weatherSample } from "@/lib/scoring/fixtures";
import { computeExpectedDuration } from "@/lib/duration/computeExpectedDuration";
import { computeTimingRecommendation } from "@/lib/timing/computeTimingRecommendation";
import { resolveWeatherScene } from "./resolveWeatherScene";

/**
 * The weather scene is downstream presentation only — proves that
 * resolving it (in any resulting visual state) never changes, and never
 * has a way to change, the risk index / duration / timing outputs.
 */
describe("resolveWeatherScene — never affects analytical model output", () => {
  it("risk index, expected duration, and timing recommendation are byte-identical before and after resolving weather scenes", () => {
    const r = route([segment({ mode: "drive" })]);
    const weather = weatherAnalysis({ samples: [weatherSample(undefined, [forecast({ weatherCode: 71, snowfallCm: 5, precipitationMm: 0 })])] });
    const traffic = trafficResult();
    const transit = transitAnalysis({ status: "not-applicable" });
    const targetTime = new Date("2026-09-24T15:00:00Z");

    const riskBefore = computeCommuteRisk({ route: r, weather, traffic, transit });
    const durationBefore = computeExpectedDuration({ route: r, weather, traffic, transit });
    const timingBefore = computeTimingRecommendation({ duration: durationBefore, preference: "leaveAt", targetTime });

    // Resolve several DIFFERENT weather scenes in between — proves
    // resolveWeatherScene has no side effect on any shared state the
    // model functions could read.
    resolveWeatherScene(weather, { latitude: 49.28, longitude: -123.1 });
    resolveWeatherScene(weatherAnalysis({ samples: [weatherSample(undefined, [forecast({ weatherCode: 0 })])] }), { latitude: 49.28, longitude: -123.1 });
    resolveWeatherScene(null, { latitude: 49.28, longitude: -123.1 });

    const riskAfter = computeCommuteRisk({ route: r, weather, traffic, transit });
    const durationAfter = computeExpectedDuration({ route: r, weather, traffic, transit });
    const timingAfter = computeTimingRecommendation({ duration: durationAfter, preference: "leaveAt", targetTime });

    expect(riskAfter.overallIndex).toBe(riskBefore.overallIndex);
    expect(riskAfter.label).toBe(riskBefore.label);
    expect(durationAfter.lowerBoundMinutes).toBe(durationBefore.lowerBoundMinutes);
    expect(durationAfter.upperBoundMinutes).toBe(durationBefore.upperBoundMinutes);
    expect(durationAfter.centralEstimateMinutes).toBe(durationBefore.centralEstimateMinutes);
    expect(timingAfter.leaveAt).toEqual(timingBefore.leaveAt);
  });

  it("does not mutate the RouteWeatherAnalysis object it's given", () => {
    const weather = weatherAnalysis({ samples: [weatherSample(undefined, [forecast({ weatherCode: 71, snowfallCm: 5 })])] });
    const snapshot = JSON.parse(JSON.stringify(weather));
    resolveWeatherScene(weather, { latitude: 49.28, longitude: -123.1 });
    expect(JSON.parse(JSON.stringify(weather))).toEqual(snapshot);
  });
});
