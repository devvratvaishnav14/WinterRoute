import { describe, expect, it } from "vitest";
import type { OpenMeteoLocationResult } from "./providers/openMeteo";
import { findNearestHourlyIndex, openMeteoResultToForecastPoint } from "./transform";

const RETRIEVED_AT = new Date("2026-09-24T12:00:00Z");

function fixture(overrides: Partial<OpenMeteoLocationResult["hourly"]> = {}): OpenMeteoLocationResult {
  return {
    latitude: 49.262,
    longitude: -122.918,
    elevation: 340,
    hourly: {
      time: ["2026-09-24T15:00", "2026-09-24T16:00", "2026-09-24T17:00"],
      temperature_2m: [2.1, 1.8, 1.2],
      apparent_temperature: [-1.5, -2.0, -2.8],
      precipitation: [0.4, 0.6, 0.0],
      rain: [0.0, 0.0, 0.0],
      snowfall: [0.3, 0.5, 0.0],
      precipitation_probability: [60, 70, 40],
      weather_code: [71, 73, 3],
      cloud_cover: [90, 95, 80],
      wind_speed_10m: [12, 15, 10],
      wind_gusts_10m: [20, 25, 18],
      visibility: [8000, 6000, 12000],
      ...overrides,
    },
  };
}

describe("findNearestHourlyIndex", () => {
  const times = [
    new Date("2026-09-24T15:00:00Z"),
    new Date("2026-09-24T16:00:00Z"),
    new Date("2026-09-24T17:00:00Z"),
  ];

  it("finds an exact match", () => {
    expect(findNearestHourlyIndex(times, new Date("2026-09-24T16:00:00Z"))).toBe(1);
  });

  it("finds the nearest hour for a between-hours time", () => {
    // 16:20 is 20min after 16:00 (index 1) and 40min before 17:00 (index 2).
    expect(findNearestHourlyIndex(times, new Date("2026-09-24T16:20:00Z"))).toBe(1);
  });

  it("returns null when the target is far outside the tolerance", () => {
    expect(findNearestHourlyIndex(times, new Date("2026-09-25T15:00:00Z"))).toBeNull();
  });

  it("returns null for an empty times array", () => {
    expect(findNearestHourlyIndex([], new Date())).toBeNull();
  });
});

describe("openMeteoResultToForecastPoint", () => {
  it("converts a fully-populated hour, normalizing units", () => {
    const point = openMeteoResultToForecastPoint({
      result: fixture(),
      targetTime: new Date("2026-09-24T16:00:00Z"),
      model: "hrdps",
      retrievedAt: RETRIEVED_AT,
    });

    expect(point).not.toBeNull();
    expect(point!.temperatureC).toBe(1.8);
    expect(point!.snowfallCm).toBe(0.5);
    expect(point!.windSpeedKmh).toBe(15);
    expect(point!.visibilityKm).toBe(6); // 6000m -> 6km
    expect(point!.weatherDescription).toBe("Moderate snow fall");
    expect(point!.source.displayName).toBe("Canadian HRDPS");
    expect(point!.source.retrievedAt).toBe(RETRIEVED_AT);
    expect(point!.validTime).toEqual(new Date("2026-09-24T16:00:00Z"));
  });

  it("represents a genuinely-missing variable as undefined, not 0", () => {
    const point = openMeteoResultToForecastPoint({
      result: fixture({ precipitation_probability: [null, null, null] }),
      targetTime: new Date("2026-09-24T16:00:00Z"),
      model: "hrdps",
      retrievedAt: RETRIEVED_AT,
    });

    expect(point!.precipitationProbabilityPercent).toBeUndefined();
  });

  it("returns null when the target hour is beyond this model's real forecast coverage", () => {
    // Null temperature at the matched hour == genuinely uncovered, not "temperature happens to be missing."
    const point = openMeteoResultToForecastPoint({
      result: fixture({ temperature_2m: [2.1, null, null] }),
      targetTime: new Date("2026-09-24T16:00:00Z"),
      model: "hrdps",
      retrievedAt: RETRIEVED_AT,
    });
    expect(point).toBeNull();
  });

  it("returns null when the target time isn't covered by the response at all", () => {
    const point = openMeteoResultToForecastPoint({
      result: fixture(),
      targetTime: new Date("2026-09-27T16:00:00Z"),
      model: "rdps",
      retrievedAt: RETRIEVED_AT,
    });
    expect(point).toBeNull();
  });

  it("preserves elevation from the provider response", () => {
    const point = openMeteoResultToForecastPoint({
      result: fixture(),
      targetTime: new Date("2026-09-24T15:00:00Z"),
      model: "hrdps",
      retrievedAt: RETRIEVED_AT,
    });
    expect(point!.elevationMeters).toBe(340);
  });
});
