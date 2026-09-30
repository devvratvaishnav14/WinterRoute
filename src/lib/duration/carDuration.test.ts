import { describe, expect, it } from "vitest";
import { buildCommuteFeatures } from "@/lib/scoring/buildFeatures";
import { forecast, route, segment, trafficAnalysis, trafficResult, transitAnalysis, weatherAnalysis, weatherSample } from "@/lib/scoring/fixtures";
import { buildCarContributions, buildRoadEventWidening } from "./carDuration";

function featuresFor(trafficDelayMinutes: number, recency: "near-term" | "future" = "near-term", weatherOverrides: Partial<ReturnType<typeof forecast>> = {}) {
  const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
  const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 10, ...weatherOverrides })])] });
  const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes, recency, trafficAwareDurationMinutes: 30 + trafficDelayMinutes }) } });
  return buildCommuteFeatures({ route: r, weather, traffic, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: new Date("2026-09-24T14:00:00Z") });
}

describe("buildCarContributions", () => {
  it("uses Google's traffic-aware duration directly as the central basis, not baseline + clamped delta", () => {
    const features = featuresFor(6);
    const contributions = buildCarContributions(features, 30);
    const traffic = contributions.find((c) => c.key === "carTrafficTiming");
    expect(traffic?.centralMinutes).toBe(6);
    expect(traffic?.provenance).toBe("observed-provider");
  });

  it("allows a negative delta when traffic-aware duration is faster than baseline (no artificial floor at baseline)", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 0, trafficAwareDurationMinutes: 24 }) } });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: new Date() });
    const contributions = buildCarContributions(features, 30);
    const trafficContribution = contributions.find((c) => c.key === "carTrafficTiming");
    expect(trafficContribution?.centralMinutes).toBe(-6);
  });

  it("widens uncertainty for no-traffic-data rather than assuming typical conditions", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 60 })]);
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: new Date() });
    const contributions = buildCarContributions(features, 60);
    const noTraffic = contributions.find((c) => c.key === "carNoTrafficData");
    expect(noTraffic?.upperMinutes).toBeGreaterThan(0);
    expect(noTraffic?.centralMinutes).toBe(0);
  });

  it("applies smaller weather uncertainty for a near-term trip than a future trip (avoiding double-counting traffic's own weather signal)", () => {
    const nearTerm = buildCarContributions(featuresFor(0, "near-term", { snowfallCm: 3, temperatureC: -2 }), 30);
    const future = buildCarContributions(featuresFor(0, "future", { snowfallCm: 3, temperatureC: -2 }), 30);
    const nearTermWidening = nearTerm.find((c) => c.key === "carWeatherUncertainty")?.upperMinutes ?? 0;
    const futureWidening = future.find((c) => c.key === "carWeatherUncertainty")?.upperMinutes ?? 0;
    expect(futureWidening).toBeGreaterThan(nearTermWidening);
  });

  it("never adds a non-zero central shift from weather (only uncertainty)", () => {
    const contributions = buildCarContributions(featuresFor(0, "near-term", { snowfallCm: 5, temperatureC: -3 }), 30);
    const weatherContribution = contributions.find((c) => c.key === "carWeatherUncertainty");
    expect(weatherContribution?.centralMinutes).toBe(0);
  });
});

describe("buildRoadEventWidening", () => {
  it("returns no contribution when there are no relevant events", () => {
    const features = featuresFor(0);
    expect(buildRoadEventWidening(features)).toEqual([]);
  });

  it("widens uncertainty (never the central estimate) when relevant events exist", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
    const traffic = trafficResult({
      trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficAwareDurationMinutes: 30 }) },
      roadEvents: [{ provider: "drivebc", id: "E1", eventType: "incident", headline: "x", description: "", severity: "major", timeRelevance: "overlaps", geometry: { type: "Point", coordinates: [-123.1, 49.28] } }],
    });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: new Date() });
    const contributions = buildRoadEventWidening(features);
    expect(contributions[0].centralMinutes).toBe(0);
    expect(contributions[0].upperMinutes).toBeGreaterThan(0);
  });
});
