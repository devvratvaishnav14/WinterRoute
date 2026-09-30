import { describe, expect, it } from "vitest";
import { buildCommuteFeatures } from "@/lib/scoring/buildFeatures";
import { forecast, route, segment, transitAnalysis, weatherAnalysis, weatherSample } from "@/lib/scoring/fixtures";
import { buildWalkCycleContributions } from "./walkCycleDuration";

function walkFeatures(overrides: Partial<ReturnType<typeof forecast>>, durationMinutes = 60) {
  const r = route([segment({ id: "s1", mode: "walk", durationMinutes })]);
  const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 10, ...overrides })])] });
  return buildCommuteFeatures({ route: r, weather, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "walk" }), now: new Date() });
}

describe("buildWalkCycleContributions", () => {
  it("produces no contribution for clear weather", () => {
    const contributions = buildWalkCycleContributions(walkFeatures({ precipitationMm: 0, snowfallCm: 0 }));
    expect(contributions).toEqual([]);
  });

  it("widens the upper bound only for snowfall, never the central estimate", () => {
    const contributions = buildWalkCycleContributions(walkFeatures({ snowfallCm: 3 }));
    const walk = contributions.find((c) => c.appliesTo === "walk");
    expect(walk?.centralMinutes).toBe(0);
    expect(walk?.upperMinutes).toBeGreaterThan(0);
  });

  it("scales widening with the segment's own baseline duration", () => {
    const short = buildWalkCycleContributions(walkFeatures({ snowfallCm: 3 }, 10));
    const long = buildWalkCycleContributions(walkFeatures({ snowfallCm: 3 }, 60));
    const shortWidening = short.find((c) => c.appliesTo === "walk")?.upperMinutes ?? 0;
    const longWidening = long.find((c) => c.appliesTo === "walk")?.upperMinutes ?? 0;
    expect(longWidening).toBeGreaterThan(shortWidening);
  });

  it("caps the widening rather than growing unbounded for a very long segment", () => {
    const contributions = buildWalkCycleContributions(walkFeatures({ snowfallCm: 5, temperatureC: -5 }, 600));
    const widening = contributions.find((c) => c.appliesTo === "walk")?.upperMinutes ?? 0;
    expect(widening).toBeLessThanOrEqual(15); // config.walk.maxUpperWideningMinutes
  });

  it("produces a separate cycle contribution for a cycling segment", () => {
    const r = route([segment({ id: "s1", mode: "cycle", durationMinutes: 30 })]);
    const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ windSpeedKmh: 50 })])] });
    const features = buildCommuteFeatures({ route: r, weather, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "cycle" }), now: new Date() });
    const contributions = buildWalkCycleContributions(features);
    expect(contributions.find((c) => c.appliesTo === "cycle")).toBeDefined();
  });

  it("produces no contribution when weather data is unavailable", () => {
    const r = route([segment({ id: "s1", mode: "walk", durationMinutes: 30 })]);
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "walk" }), now: new Date() });
    expect(buildWalkCycleContributions(features)).toEqual([]);
  });
});
