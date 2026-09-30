import { describe, expect, it } from "vitest";
import { buildCommuteFeatures } from "./buildFeatures";
import { scoreWeatherFactor } from "./weatherScore";
import { forecast, route, segment, weatherAnalysis, weatherSample } from "./fixtures";

function featuresFor(mode: "walk" | "cycle" | "drive" | "bus" | "rail", overrides: Partial<ReturnType<typeof forecast>> = {}) {
  const r = route([segment({ id: "seg-1", mode, durationMinutes: 20 })]);
  const weather = weatherAnalysis({ samples: [weatherSample("seg-1", [forecast({ temperatureC: 10, ...overrides })])] });
  return buildCommuteFeatures({ route: r, weather, traffic: null, transit: null });
}

describe("scoreWeatherFactor", () => {
  it("returns 'unavailable' when no segment has weather data", () => {
    const r = route([segment({ id: "seg-1", mode: "walk" })]);
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: null });
    expect(scoreWeatherFactor(features).status).toBe("unavailable");
  });

  it("scores near zero for clear weather (Case A baseline)", () => {
    const features = featuresFor("walk", { temperatureC: 12, precipitationMm: 0, snowfallCm: 0, windSpeedKmh: 5, visibilityKm: 15 });
    const result = scoreWeatherFactor(features);
    expect(result.status).toBe("scored");
    expect(result.score).toBeLessThan(15);
  });

  it("scores substantially higher for heavy precipitation, freezing, and high wind on a walking trip", () => {
    const clear = scoreWeatherFactor(featuresFor("walk", { temperatureC: 12, precipitationMm: 0, windSpeedKmh: 5 }));
    const severe = scoreWeatherFactor(featuresFor("walk", { temperatureC: -3, precipitationMm: 12, windSpeedKmh: 55, visibilityKm: 1.5 }));
    expect(severe.score!).toBeGreaterThan(clear.score! + 30);
  });

  it("is monotonic: more snowfall never scores lower, all else equal", () => {
    const scores = [0, 1, 3, 6, 10].map((snowfallCm) => scoreWeatherFactor(featuresFor("drive", { snowfallCm })).score!);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("is mode-aware: identical high wind scores higher for cycling than for driving", () => {
    const cycle = scoreWeatherFactor(featuresFor("cycle", { windSpeedKmh: 45, temperatureC: 10 }));
    const drive = scoreWeatherFactor(featuresFor("drive", { windSpeedKmh: 45, temperatureC: 10 }));
    expect(cycle.score!).toBeGreaterThan(drive.score!);
  });

  it("is mode-aware: identical conditions score far lower for rail than for walking", () => {
    const walk = scoreWeatherFactor(featuresFor("walk", { snowfallCm: 4, windSpeedKmh: 40, temperatureC: -2 }));
    const rail = scoreWeatherFactor(featuresFor("rail", { snowfallCm: 4, windSpeedKmh: 40, temperatureC: -2 }));
    expect(rail.score!).toBeLessThan(walk.score!);
  });

  it("adds an official-alert contribution without needing a segment-level alert match", () => {
    const r = route([segment({ id: "seg-1", mode: "walk", durationMinutes: 20 })]);
    const weather = weatherAnalysis({
      samples: [weatherSample("seg-1", [forecast({ temperatureC: 10, precipitationMm: 0 })])],
      alerts: [{ provider: "eccc", id: "1", alertType: "warning", title: "Snowfall Warning", summary: "" }],
    });
    const withAlert = scoreWeatherFactor(buildCommuteFeatures({ route: r, weather, traffic: null, transit: null }));
    const withoutAlert = scoreWeatherFactor(featuresFor("walk", { precipitationMm: 0 }));
    expect(withAlert.score!).toBeGreaterThan(withoutAlert.score!);
    expect(withAlert.contributions.some((c) => c.key === "officialAlert")).toBe(true);
  });

  it("excludes a segment with no weather data from the weighted average rather than treating it as zero severity", () => {
    const r = route([
      segment({ id: "s1", mode: "walk", durationMinutes: 10 }),
      segment({ id: "s2", mode: "walk", durationMinutes: 50 }), // no sample tagged for s2
    ]);
    const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ snowfallCm: 5, temperatureC: -3 })])] });
    const features = buildCommuteFeatures({ route: r, weather, traffic: null, transit: null });
    const result = scoreWeatherFactor(features);
    // If s2's missing data were treated as 0, the weighted average (10/60 weight) would pull the score down heavily.
    // Since s2 is excluded from the average entirely, the score should reflect s1's own severity directly.
    expect(result.score!).toBeGreaterThan(50);
  });
});
