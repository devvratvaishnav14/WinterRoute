import { describe, expect, it } from "vitest";
import type { RouteWeatherAnalysis, WeatherForecastPoint, WeatherModelSource } from "./types";
import { describeSampleLocations, summarizeRouteWeatherOverview } from "./overview";

function source(displayName: string): WeatherModelSource {
  return {
    provider: "open-meteo",
    modelId: displayName.toLowerCase(),
    displayName,
    organization: "Test",
    retrievedAt: new Date("2026-09-24T12:00:00Z"),
  };
}

function forecast(overrides: Partial<WeatherForecastPoint>): WeatherForecastPoint {
  return {
    latitude: 49.28,
    longitude: -122.92,
    validTime: new Date("2026-09-24T16:00:00Z"),
    source: source("Model"),
    ...overrides,
  };
}

function analysis(samples: RouteWeatherAnalysis["samples"]): RouteWeatherAnalysis {
  return {
    analyzedAt: new Date("2026-09-24T12:00:00Z"),
    timePreference: "leaveAt",
    tripDateTime: new Date("2026-09-24T16:00:00Z"),
    usedNominalBaselineTimeline: false,
    samples,
    modelStatus: [],
    alerts: [],
    alertStatus: "ok",
  };
}

describe("summarizeRouteWeatherOverview", () => {
  it("computes route-wide temperature/wind ranges across all samples and models", () => {
    const result = summarizeRouteWeatherOverview(
      analysis([
        {
          point: { id: "s1", latitude: 49.28, longitude: -122.92, label: "Burnaby", estimatedTime: new Date() },
          forecasts: [
            forecast({ source: source("Canadian"), temperatureC: 4, windSpeedKmh: 15 }),
            forecast({ source: source("ECMWF"), temperatureC: 5, windSpeedKmh: 20 }),
          ],
          ensemble: { modelsAttempted: 3, modelsAvailable: 2 },
        },
        {
          point: { id: "s2", latitude: 49.19, longitude: -122.85, label: "Surrey", estimatedTime: new Date() },
          forecasts: [forecast({ source: source("GFS"), temperatureC: 7, windSpeedKmh: 25 })],
          ensemble: { modelsAttempted: 3, modelsAvailable: 1 },
        },
      ]),
    );

    expect(result.hasData).toBe(true);
    expect(result.temperatureRangeC).toEqual({ min: 4, max: 7 });
    expect(result.windRangeKmh).toEqual({ min: 15, max: 25 });
  });

  it("counts models predicting precipitation/snow, out of models that actually had data", () => {
    const result = summarizeRouteWeatherOverview(
      analysis([
        {
          point: { id: "s1", latitude: 49.28, longitude: -122.92, label: "A", estimatedTime: new Date() },
          forecasts: [
            forecast({ source: source("Canadian"), precipitationMm: 4.1, snowfallCm: 0.5 }),
            forecast({ source: source("ECMWF"), precipitationMm: 0 }),
            forecast({ source: source("GFS"), precipitationMm: 2.0 }),
          ],
          ensemble: { modelsAttempted: 3, modelsAvailable: 3 },
        },
      ]),
    );

    expect(result.precipitation).toEqual({ modelsPredicting: 2, modelsWithData: 3 });
    expect(result.snow).toEqual({ modelsPredicting: 1, modelsWithData: 3 });
  });

  it("does not count a failed model as 'not predicting' — modelsWithData reflects only models that returned data", () => {
    const result = summarizeRouteWeatherOverview(
      analysis([
        {
          point: { id: "s1", latitude: 49.28, longitude: -122.92, label: "A", estimatedTime: new Date() },
          // Only 2 of 3 models succeeded anywhere.
          forecasts: [forecast({ source: source("Canadian"), precipitationMm: 1 }), forecast({ source: source("ECMWF"), precipitationMm: 0 })],
          ensemble: { modelsAttempted: 3, modelsAvailable: 2 },
        },
      ]),
    );
    expect(result.precipitation.modelsWithData).toBe(2);
  });

  it("returns hasData: false and no ranges when there are no samples/forecasts at all", () => {
    const result = summarizeRouteWeatherOverview(analysis([]));
    expect(result.hasData).toBe(false);
    expect(result.temperatureRangeC).toBeUndefined();
  });
});

describe("describeSampleLocations", () => {
  it("joins unique named waypoints in order, skipping interpolated points", () => {
    const result = describeSampleLocations(
      analysis([
        { point: { id: "1", latitude: 0, longitude: 0, label: "SFU Burnaby", estimatedTime: new Date() }, forecasts: [], ensemble: { modelsAttempted: 3, modelsAvailable: 0 } },
        { point: { id: "2", latitude: 0, longitude: 0, label: "En route", estimatedTime: new Date() }, forecasts: [], ensemble: { modelsAttempted: 3, modelsAvailable: 0 } },
        { point: { id: "3", latitude: 0, longitude: 0, label: "New Westminster stop", estimatedTime: new Date() }, forecasts: [], ensemble: { modelsAttempted: 3, modelsAvailable: 0 } },
        { point: { id: "4", latitude: 0, longitude: 0, label: "Surrey Central", estimatedTime: new Date() }, forecasts: [], ensemble: { modelsAttempted: 3, modelsAvailable: 0 } },
      ]),
    );
    expect(result).toBe("SFU Burnaby → New Westminster stop → Surrey Central");
  });
});
