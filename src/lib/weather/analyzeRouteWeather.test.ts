import { afterEach, describe, expect, it, vi } from "vitest";
import type { Route } from "@/lib/route/types";
import type { OpenMeteoLocationResult } from "./providers/openMeteo";
import * as openMeteoProvider from "./providers/openMeteo";
import * as ecccProvider from "./providers/eccc";
import { analyzeRouteWeather, isWeatherDataUnavailable } from "./analyzeRouteWeather";

function loc(label: string, latitude: number, longitude: number) {
  return { label, latitude, longitude };
}

function simpleRoute(): Route {
  return {
    origin: loc("SFU Burnaby", 49.2781, -122.9199),
    destination: loc("Downtown Vancouver", 49.2827, -123.1207),
    baselineDurationMinutes: 36,
    totalDistanceMeters: 18554,
    segments: [
      {
        id: "drive-1",
        mode: "drive",
        start: loc("SFU Burnaby", 49.2781, -122.9199),
        end: loc("Downtown Vancouver", 49.2827, -123.1207),
        durationMinutes: 36,
        distanceMeters: 18554,
      },
    ],
  };
}

function openMeteoFixture(temperature: number): OpenMeteoLocationResult[] {
  return [
    {
      latitude: 49.28,
      longitude: -122.92,
      elevation: 100,
      hourly: {
        time: ["2026-09-24T16:00", "2026-09-24T17:00"],
        temperature_2m: [temperature, temperature],
        precipitation: [0, 0],
      },
    },
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

const TRIP_DATE_TIME = new Date("2026-09-24T16:00:00Z");

describe("analyzeRouteWeather", () => {
  it("preserves each model's forecast separately when all providers succeed", async () => {
    vi.spyOn(openMeteoProvider, "fetchOpenMeteoModel").mockImplementation(async ({ model }) => {
      const temps: Record<string, number> = { hrdps: 4.1, rdps: 4.1, ecmwf: 2.8, gfs: 0.9 };
      return openMeteoFixture(temps[model]);
    });
    vi.spyOn(ecccProvider, "fetchEcccAlerts").mockResolvedValue([]);

    const analysis = await analyzeRouteWeather({
      route: simpleRoute(),
      timePreference: "leaveAt",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(analysis.modelStatus.every((m) => m.succeeded)).toBe(true);
    expect(isWeatherDataUnavailable(analysis)).toBe(false);

    const firstSample = analysis.samples[0];
    const temperatures = firstSample.forecasts.map((f) => f.temperatureC).sort();
    // 3 distinct values preserved (Canadian slot used HRDPS, not both HRDPS+RDPS).
    expect(firstSample.forecasts).toHaveLength(3);
    expect(temperatures).toEqual([0.9, 2.8, 4.1]);
  });

  it("reports partial availability when one model fails but others succeed", async () => {
    vi.spyOn(openMeteoProvider, "fetchOpenMeteoModel").mockImplementation(async ({ model }) => {
      if (model === "ecmwf") throw new openMeteoProvider.OpenMeteoRequestError("down", 500);
      const temps: Record<string, number> = { hrdps: 4.1, rdps: 4.1, gfs: 0.9 };
      return openMeteoFixture(temps[model]);
    });
    vi.spyOn(ecccProvider, "fetchEcccAlerts").mockResolvedValue([]);

    const analysis = await analyzeRouteWeather({
      route: simpleRoute(),
      timePreference: "leaveAt",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(isWeatherDataUnavailable(analysis)).toBe(false);
    const ecmwfStatus = analysis.modelStatus.find((m) => m.modelId === "ecmwf_ifs025");
    expect(ecmwfStatus?.succeeded).toBe(false);
    expect(ecmwfStatus?.errorMessage).toBeTruthy();
    // The other two models' data still comes through.
    expect(analysis.samples[0].forecasts).toHaveLength(2);
  });

  it("reports weather data as unavailable when every model fails", async () => {
    vi.spyOn(openMeteoProvider, "fetchOpenMeteoModel").mockRejectedValue(
      new openMeteoProvider.OpenMeteoRequestError("down", 500),
    );
    vi.spyOn(ecccProvider, "fetchEcccAlerts").mockResolvedValue([]);

    const analysis = await analyzeRouteWeather({
      route: simpleRoute(),
      timePreference: "leaveAt",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(isWeatherDataUnavailable(analysis)).toBe(true);
    expect(analysis.samples[0].forecasts).toHaveLength(0);
    expect(analysis.samples[0].ensemble.modelsAvailable).toBe(0);
  });

  it("reports alertStatus 'unavailable' (not silently 'no alerts') when ECCC fails", async () => {
    vi.spyOn(openMeteoProvider, "fetchOpenMeteoModel").mockResolvedValue(openMeteoFixture(3));
    vi.spyOn(ecccProvider, "fetchEcccAlerts").mockRejectedValue(new ecccProvider.EcccRequestError("down", 500));

    const analysis = await analyzeRouteWeather({
      route: simpleRoute(),
      timePreference: "leaveAt",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(analysis.alertStatus).toBe("unavailable");
    expect(analysis.alerts).toEqual([]);
  });

  it("still analyzes weather successfully even when the alert service fails", async () => {
    vi.spyOn(openMeteoProvider, "fetchOpenMeteoModel").mockResolvedValue(openMeteoFixture(3));
    vi.spyOn(ecccProvider, "fetchEcccAlerts").mockRejectedValue(new Error("network down"));

    const analysis = await analyzeRouteWeather({
      route: simpleRoute(),
      timePreference: "leaveAt",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(isWeatherDataUnavailable(analysis)).toBe(false);
    expect(analysis.samples[0].forecasts.length).toBeGreaterThan(0);
  });

  it("labels the timeline as nominal for a non-transit Arrive By trip", async () => {
    vi.spyOn(openMeteoProvider, "fetchOpenMeteoModel").mockResolvedValue(openMeteoFixture(3));
    vi.spyOn(ecccProvider, "fetchEcccAlerts").mockResolvedValue([]);

    const analysis = await analyzeRouteWeather({
      route: simpleRoute(),
      timePreference: "arriveBy",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(analysis.usedNominalBaselineTimeline).toBe(true);
  });
});
