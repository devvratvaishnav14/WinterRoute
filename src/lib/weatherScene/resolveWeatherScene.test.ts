import { describe, expect, it } from "vitest";
import { forecast, weatherAnalysis, weatherSample } from "@/lib/scoring/fixtures";
import type { WeatherForecastPoint } from "@/lib/weather/types";
import { resolveWeatherScene } from "./resolveWeatherScene";

const VANCOUVER = { latitude: 49.28, longitude: -123.12 };
const MIDDAY = new Date("2026-09-24T20:00:00Z"); // clear midday Pacific time, for day/night neutrality in single-model tests

function model(modelId: string, overrides: Partial<WeatherForecastPoint> = {}): WeatherForecastPoint {
  return forecast({
    source: { provider: "open-meteo", modelId, displayName: modelId, organization: "Test", retrievedAt: new Date() },
    validTime: MIDDAY,
    ...overrides,
  });
}

function analysisWith(forecasts: WeatherForecastPoint[]) {
  return weatherAnalysis({ tripDateTime: MIDDAY, samples: [weatherSample(undefined, forecasts)] });
}

describe("resolveWeatherScene — single-model WMO code mapping", () => {
  const cases: Array<[number, string]> = [
    [0, "clear"],
    [1, "clear"],
    [2, "partly-cloudy"],
    [3, "cloudy"],
    [45, "fog"],
    [51, "drizzle"],
    [61, "rain"],
    [65, "heavy-rain"],
    [56, "freezing-rain"],
    [66, "freezing-rain"],
    [71, "snow"],
    [75, "heavy-snow"],
    [85, "snow"],
    [95, "thunderstorm"],
  ];

  it.each(cases)("maps WMO code %s to condition %s", (code, expected) => {
    const scene = resolveWeatherScene(analysisWith([model("m1", { weatherCode: code, precipitationMm: 2, snowfallCm: 2 })]), VANCOUVER);
    expect(scene.condition).toBe(expected);
  });

  it("shows a neutral 'unknown' scene, never a fabricated 'clear', when there's no analysis at all", () => {
    const scene = resolveWeatherScene(null, VANCOUVER);
    expect(scene.condition).toBe("unknown");
    expect(scene.dataStatus).toBe("unavailable");
  });

  it("shows a neutral 'unknown' scene when models returned no usable data", () => {
    const scene = resolveWeatherScene(analysisWith([]), VANCOUVER);
    expect(scene.condition).toBe("unknown");
    expect(scene.dataStatus).toBe("unavailable");
  });
});

describe("resolveWeatherScene — multi-model consensus", () => {
  it("3/3 clear -> clear", () => {
    const scene = resolveWeatherScene(
      analysisWith([model("hrdps", { weatherCode: 0 }), model("ecmwf", { weatherCode: 0 }), model("gfs", { weatherCode: 0 })]),
      VANCOUVER,
    );
    expect(scene.condition).toBe("clear");
  });

  it("clear + partly cloudy + overcast (no majority) -> the middle sky-only consensus, not a rainstorm", () => {
    const scene = resolveWeatherScene(
      analysisWith([model("hrdps", { weatherCode: 0 }), model("ecmwf", { weatherCode: 2 }), model("gfs", { weatherCode: 3 })]),
      VANCOUVER,
    );
    expect(scene.condition).toBe("partly-cloudy");
  });

  it("3/3 rain -> rain", () => {
    const scene = resolveWeatherScene(
      analysisWith([
        model("hrdps", { weatherCode: 61, precipitationMm: 3 }),
        model("ecmwf", { weatherCode: 61, precipitationMm: 3 }),
        model("gfs", { weatherCode: 61, precipitationMm: 3 }),
      ]),
      VANCOUVER,
    );
    expect(scene.condition).toBe("rain");
  });

  it("2 rain + 1 clear (majority) -> rain", () => {
    const scene = resolveWeatherScene(
      analysisWith([
        model("hrdps", { weatherCode: 61, precipitationMm: 3 }),
        model("ecmwf", { weatherCode: 61, precipitationMm: 3 }),
        model("gfs", { weatherCode: 0 }),
      ]),
      VANCOUVER,
    );
    expect(scene.condition).toBe("rain");
  });

  it("1 light drizzle + 2 dry (clear) -> majority clear wins, not a rainstorm", () => {
    const scene = resolveWeatherScene(
      analysisWith([model("hrdps", { weatherCode: 51, precipitationMm: 0.2 }), model("ecmwf", { weatherCode: 0 }), model("gfs", { weatherCode: 0 })]),
      VANCOUVER,
    );
    expect(scene.condition).toBe("clear");
  });

  it("2 snow + 1 rain (majority) -> snow", () => {
    const scene = resolveWeatherScene(
      analysisWith([
        model("hrdps", { weatherCode: 71, snowfallCm: 2 }),
        model("ecmwf", { weatherCode: 71, snowfallCm: 2 }),
        model("gfs", { weatherCode: 61, precipitationMm: 2 }),
      ]),
      VANCOUVER,
    );
    expect(scene.condition).toBe("snow");
  });

  it("significant thunderstorm evidence (majority + alert) -> thunderstorm", () => {
    const scene = resolveWeatherScene(
      {
        ...analysisWith([
          model("hrdps", { weatherCode: 95, precipitationMm: 5 }),
          model("ecmwf", { weatherCode: 95, precipitationMm: 5 }),
          model("gfs", { weatherCode: 61, precipitationMm: 2 }),
        ]),
        alerts: [{ provider: "eccc", id: "a1", alertType: "warning", title: "Severe Thunderstorm Warning", summary: "" }],
      },
      VANCOUVER,
    );
    expect(scene.condition).toBe("thunderstorm");
  });

  it("models unavailable (empty model status, no forecasts) -> unknown, neutral scene", () => {
    const scene = resolveWeatherScene(weatherAnalysis({ tripDateTime: MIDDAY, samples: [], modelStatus: [] }), VANCOUVER);
    expect(scene.condition).toBe("unknown");
    expect(scene.dataStatus).toBe("unavailable");
  });

  it("partial route precipitation (rain only at one of two sample points, still a real model signal) is picked up", () => {
    const scene = resolveWeatherScene(
      weatherAnalysis({
        tripDateTime: MIDDAY,
        samples: [
          weatherSample("seg1", [model("hrdps", { weatherCode: 0 }), model("ecmwf", { weatherCode: 0 }), model("gfs", { weatherCode: 0 })]),
          weatherSample("seg2", [
            model("hrdps", { weatherCode: 61, precipitationMm: 3 }),
            model("ecmwf", { weatherCode: 61, precipitationMm: 3 }),
            model("gfs", { weatherCode: 61, precipitationMm: 3 }),
          ]),
        ],
      }),
      VANCOUVER,
    );
    // Each model's own WORST case along the route is rain (3/3), so rain wins even though half the route was clear.
    expect(scene.condition).toBe("rain");
  });

  it("weather only at one small route section, from only one model, does not dominate the whole-page scene", () => {
    const scene = resolveWeatherScene(
      weatherAnalysis({
        tripDateTime: MIDDAY,
        samples: [
          weatherSample("seg1", [model("hrdps", { weatherCode: 0 }), model("ecmwf", { weatherCode: 0 }), model("gfs", { weatherCode: 0 })]),
          weatherSample("seg2", [model("hrdps", { weatherCode: 65, precipitationMm: 10 }), model("ecmwf", { weatherCode: 0 }), model("gfs", { weatherCode: 0 })]),
        ],
      }),
      VANCOUVER,
    );
    // Only hrdps's worst case is heavy-rain; ecmwf/gfs are clear throughout -> no majority for heavy-rain.
    expect(scene.condition).not.toBe("heavy-rain");
  });
});

describe("resolveWeatherScene — compositional sky/lightning fields", () => {
  it("clear (code 0) resolves sky 'clear'; mainly clear (code 1) resolves sky 'mainly-clear' — both stay condition 'clear'", () => {
    const clear = resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 0 })]), VANCOUVER);
    const mainlyClear = resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 1 })]), VANCOUVER);
    expect(clear.condition).toBe("clear");
    expect(clear.sky).toBe("clear");
    expect(mainlyClear.condition).toBe("clear");
    expect(mainlyClear.sky).toBe("mainly-clear");
  });

  it("overcast (cloudy) resolves sky 'overcast'; fog resolves sky 'foggy'", () => {
    expect(resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 3 })]), VANCOUVER).sky).toBe("overcast");
    expect(resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 45 })]), VANCOUVER).sky).toBe("foggy");
  });

  it("any genuine precipitation forces an overcast sky backdrop — this app never renders a sun-shower", () => {
    const rain = resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 61, precipitationMm: 3 })]), VANCOUVER);
    expect(rain.sky).toBe("overcast");
  });

  it("thunderstorm sets lightning true regardless of measured precipitation", () => {
    const wet = resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 95, precipitationMm: 5 })]), VANCOUVER);
    const dry = resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 95, precipitationMm: 0, snowfallCm: 0 })]), VANCOUVER);
    expect(wet.lightning).toBe(true);
    expect(dry.lightning).toBe(true);
  });

  it("a genuine DRY thunderstorm (no measured precipitation/snowfall) reports precipitationType 'none' — no fake rain", () => {
    const dry = resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 95, precipitationMm: 0, snowfallCm: 0 })]), VANCOUVER);
    expect(dry.condition).toBe("thunderstorm");
    expect(dry.precipitationType).toBe("none");
  });

  it("a thunderstorm WITH measured rain reports precipitationType 'rain'", () => {
    const wet = resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 95, precipitationMm: 5 })]), VANCOUVER);
    expect(wet.precipitationType).toBe("rain");
  });

  it("non-thunderstorm conditions never set lightning", () => {
    expect(resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 61, precipitationMm: 3 })]), VANCOUVER).lightning).toBe(false);
    expect(resolveWeatherScene(analysisWith([model("hrdps", { weatherCode: 0 })]), VANCOUVER).lightning).toBe(false);
  });

  it("no analysis at all: lightning false, sky a neutral default (never implying a resolved sun/storm)", () => {
    const scene = resolveWeatherScene(null, VANCOUVER);
    expect(scene.lightning).toBe(false);
    expect(scene.dataStatus).toBe("unavailable");
  });
});

describe("resolveWeatherScene — supporting fields", () => {
  it("never claims measurable precipitation for a minority vote with no measurable amount backing it", () => {
    const scene = resolveWeatherScene(
      analysisWith([model("hrdps", { weatherCode: 51, precipitationMm: 0 }), model("ecmwf", { weatherCode: 51, precipitationMm: 0 })]),
      VANCOUVER,
    );
    expect(scene.condition).not.toBe("drizzle");
  });

  it("uses the selected trip time, not the current real time, for day/night", () => {
    const nightTrip = new Date("2026-09-25T08:00:00Z"); // Pacific nighttime
    const scene = resolveWeatherScene(
      weatherAnalysis({ tripDateTime: nightTrip, samples: [weatherSample(undefined, [model("hrdps", { weatherCode: 0, validTime: nightTrip })])] }),
      VANCOUVER,
    );
    expect(scene.selectedTripTime).toEqual(nightTrip);
    expect(scene.dayPhase).toBe("night");
  });

  it("never returns a data status implying resolution when analysis is missing", () => {
    const scene = resolveWeatherScene(null, VANCOUVER);
    expect(scene.dataStatus).toBe("unavailable");
    expect(scene.condition).not.toBe("clear");
  });
});
