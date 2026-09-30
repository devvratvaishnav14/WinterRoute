import { describe, expect, it } from "vitest";
import type { WeatherForecastPoint, WeatherModelSource } from "./types";
import { summarizeEnsemble } from "./ensemble";

function source(displayName: string): WeatherModelSource {
  return {
    provider: "open-meteo",
    modelId: displayName.toLowerCase(),
    displayName,
    organization: "Test",
    retrievedAt: new Date("2026-09-24T12:00:00Z"),
  };
}

function point(overrides: Partial<WeatherForecastPoint>): WeatherForecastPoint {
  return {
    latitude: 49.28,
    longitude: -122.92,
    validTime: new Date("2026-09-24T16:00:00Z"),
    source: source("Model"),
    ...overrides,
  };
}

describe("summarizeEnsemble", () => {
  it("computes median/min/max across models that disagree", () => {
    const forecasts = [
      point({ source: source("Canadian"), temperatureC: 1.2, precipitationMm: 4.1 }),
      point({ source: source("ECMWF"), temperatureC: 2.1, precipitationMm: 2.8 }),
      point({ source: source("GFS"), temperatureC: 3.4, precipitationMm: 0.9 }),
    ];

    const summary = summarizeEnsemble(forecasts, 3);

    expect(summary.modelsAttempted).toBe(3);
    expect(summary.modelsAvailable).toBe(3);
    expect(summary.temperatureC).toEqual({ median: 2.1, min: 1.2, max: 3.4 });
    expect(summary.precipitationMm?.median).toBe(2.8);
    expect(summary.precipitationMm?.modelsPredicting).toBe(3);
  });

  it("counts only models with a strictly-positive precipitation/snow value as 'predicting' it", () => {
    const forecasts = [
      point({ precipitationMm: 0, snowfallCm: 0 }),
      point({ precipitationMm: 1.5, snowfallCm: 0.8 }),
      point({ precipitationMm: 0, snowfallCm: 0 }),
    ];
    const summary = summarizeEnsemble(forecasts, 3);
    expect(summary.precipitationMm?.modelsPredicting).toBe(1);
    expect(summary.snowfallCm?.modelsPredicting).toBe(1);
  });

  it("reflects modelsAvailable < modelsAttempted when one model was unavailable", () => {
    const forecasts = [point({ temperatureC: 1 }), point({ temperatureC: 2 })];
    const summary = summarizeEnsemble(forecasts, 3);
    expect(summary.modelsAttempted).toBe(3);
    expect(summary.modelsAvailable).toBe(2);
  });

  it("omits a variable's summary entirely when no model reported it, rather than faking zeros", () => {
    const forecasts = [point({ temperatureC: 1 })]; // no precipitation/snow/wind on any forecast
    const summary = summarizeEnsemble(forecasts, 1);
    expect(summary.precipitationMm).toBeUndefined();
    expect(summary.snowfallCm).toBeUndefined();
    expect(summary.windSpeedKmh).toBeUndefined();
  });

  it("handles zero available models (all sources failed) without throwing", () => {
    const summary = summarizeEnsemble([], 3);
    expect(summary.modelsAvailable).toBe(0);
    expect(summary.temperatureC).toBeUndefined();
  });

  it("computes an even-count median as the average of the two middle values", () => {
    const forecasts = [point({ temperatureC: 1 }), point({ temperatureC: 3 })];
    const summary = summarizeEnsemble(forecasts, 2);
    expect(summary.temperatureC?.median).toBe(2);
  });
});
