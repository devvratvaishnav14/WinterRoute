import { describe, expect, it } from "vitest";
import { forecast, route, segment, weatherAnalysis, weatherSample } from "@/lib/scoring/fixtures";
import type { WeatherForecastPoint } from "@/lib/weather/types";
import { buildWeatherHeadlines } from "./weatherHeadline";

const r = route([segment({ mode: "walk" })]);

function model(modelId: string, overrides: Partial<WeatherForecastPoint> = {}): WeatherForecastPoint {
  return forecast({ source: { provider: "open-meteo", modelId, displayName: modelId, organization: "Test", retrievedAt: new Date() }, ...overrides });
}

/** N identical sample points, each with the given forecasts — a simple way to control "how many samples are affected" for coverage tests. */
function analysisWithSamples(samplesForecasts: WeatherForecastPoint[][]) {
  return weatherAnalysis({ samples: samplesForecasts.map((fs, i) => weatherSample(`seg-${i}`, fs)) });
}

const dryModels = (...ids: string[]) => ids.map((id) => model(id, { precipitationMm: 0 }));

describe("buildWeatherHeadlines — title/sentence split", () => {
  it("never repeats the generic noun as the title followed by a sentence restating it", () => {
    const analysis = analysisWithSamples([[model("a", { precipitationMm: 2 }), model("b", { precipitationMm: 2 }), model("c", { precipitationMm: 2 })]]);
    const headlines = buildWeatherHeadlines(analysis, r)!;
    expect(headlines.rain.title).not.toBe("Rain");
    expect(headlines.rain.title.length).toBeGreaterThan(0);
    expect(headlines.rain.sentence).not.toBe(headlines.rain.title);
  });

  it("1 of 3 models predicting light rain -> 'Light Rain Possible' with a natural singular sentence", () => {
    const analysis = analysisWithSamples([[model("a", { precipitationMm: 1 }), model("b", { precipitationMm: 0 }), model("c", { precipitationMm: 0 })]]);
    const headlines = buildWeatherHeadlines(analysis, r)!;
    expect(headlines.rain.title).toBe("Light Rain Possible");
    expect(headlines.rain.sentence.startsWith("One forecast model predicts light rain")).toBe(true);
  });

  it("2 of 3 models predicting light rain -> 'Light Rain Likely' with natural plural sentence", () => {
    const analysis = analysisWithSamples([[model("a", { precipitationMm: 1 }), model("b", { precipitationMm: 1 }), model("c", { precipitationMm: 0 })]]);
    const headlines = buildWeatherHeadlines(analysis, r)!;
    expect(headlines.rain.title).toBe("Light Rain Likely");
    expect(headlines.rain.sentence.startsWith("Two of three forecast models predict light rain")).toBe(true);
  });

  it("3 of 3 models predicting light rain -> 'Light Rain Expected' with 'All three...' sentence", () => {
    const analysis = analysisWithSamples([[model("a", { precipitationMm: 1 }), model("b", { precipitationMm: 1 }), model("c", { precipitationMm: 1 })]]);
    const headlines = buildWeatherHeadlines(analysis, r)!;
    expect(headlines.rain.title).toBe("Light Rain Expected");
    expect(headlines.rain.sentence.startsWith("All three forecast models predict light rain")).toBe(true);
  });

  it("heavy rain title reads 'Heavy Rain Expected' when fully agreed", () => {
    const analysis = analysisWithSamples([[model("a", { precipitationMm: 10 }), model("b", { precipitationMm: 10 }), model("c", { precipitationMm: 10 })]]);
    expect(buildWeatherHeadlines(analysis, r)!.rain.title).toBe("Heavy Rain Expected");
  });

  it("snow equivalents follow the same title pattern", () => {
    const analysis = analysisWithSamples([[model("a", { snowfallCm: 5 }), model("b", { snowfallCm: 5 }), model("c", { snowfallCm: 5 })]]);
    expect(buildWeatherHeadlines(analysis, r)!.snow.title).toBe("Heavy Snow Expected");
  });

  it("never uses the technical phrase 'measurable rain'/'measurable snow' in the sentence", () => {
    const analysis = analysisWithSamples([[model("a", { precipitationMm: 1 }), model("b", { snowfallCm: 1 })]]);
    const headlines = buildWeatherHeadlines(analysis, r)!;
    expect(headlines.rain.sentence).not.toMatch(/measurable/);
    expect(headlines.snow.sentence).not.toMatch(/measurable/);
  });

  it("uses natural full-sentence grammar, not a bare 'N of M' fragment, for the sentence", () => {
    const analysis = analysisWithSamples([[model("a", { precipitationMm: 1 }), model("b", { precipitationMm: 0 }), model("c", { precipitationMm: 0 })]]);
    const sentence = buildWeatherHeadlines(analysis, r)!.rain.sentence;
    expect(sentence).not.toMatch(/^\d/); // never starts with a bare digit
    expect(sentence.endsWith(".")).toBe(true);
  });
});

describe("buildWeatherHeadlines — route coverage wording", () => {
  it("isolated coverage reads 'near a small part of your route'", () => {
    const wet = [model("a", { precipitationMm: 2 }), model("b", { precipitationMm: 2 }), model("c", { precipitationMm: 2 })];
    const analysis = analysisWithSamples([wet, dryModels("a", "b", "c"), dryModels("a", "b", "c"), dryModels("a", "b", "c"), dryModels("a", "b", "c")]);
    expect(buildWeatherHeadlines(analysis, r)!.rain.sentence).toMatch(/near a small part of your route/);
  });

  it("most-all coverage reads 'across most of your route'", () => {
    const wet = [model("a", { precipitationMm: 2 }), model("b", { precipitationMm: 2 }), model("c", { precipitationMm: 2 })];
    const analysis = analysisWithSamples([wet, wet, wet, wet]);
    expect(buildWeatherHeadlines(analysis, r)!.rain.sentence).toMatch(/across most of your route/);
  });
});

describe("buildWeatherHeadlines — ordinary sky conditions", () => {
  it("clear", () => {
    const analysis = analysisWithSamples([[model("a", { weatherCode: 0, precipitationMm: 0 }), model("b", { weatherCode: 0 }), model("c", { weatherCode: 0 })]]);
    const sky = buildWeatherHeadlines(analysis, r)!.sky;
    expect(sky.title).toBe("Clear");
    expect(sky.sentence).toMatch(/Clear conditions/);
  });

  it("partly cloudy", () => {
    const analysis = analysisWithSamples([[model("a", { weatherCode: 2, precipitationMm: 0 }), model("b", { weatherCode: 2 }), model("c", { weatherCode: 2 })]]);
    expect(buildWeatherHeadlines(analysis, r)!.sky.title).toBe("Partly Cloudy");
  });

  it("cloudy", () => {
    const analysis = analysisWithSamples([[model("a", { weatherCode: 3, precipitationMm: 0 }), model("b", { weatherCode: 3 }), model("c", { weatherCode: 3 })]]);
    expect(buildWeatherHeadlines(analysis, r)!.sky.title).toBe("Cloudy");
  });

  it("fog", () => {
    const analysis = analysisWithSamples([[model("a", { weatherCode: 45, precipitationMm: 0 }), model("b", { weatherCode: 45 }), model("c", { weatherCode: 45 })]]);
    expect(buildWeatherHeadlines(analysis, r)!.sky.title).toBe("Fog");
  });
});

describe("buildWeatherHeadlines — strong wind", () => {
  it("promotes strong wind with its own title/sentence", () => {
    const analysis = analysisWithSamples([[model("a", { windGustsKmh: 60, precipitationMm: 0 })]]);
    const wind = buildWeatherHeadlines(analysis, r)!.strongWind;
    expect(wind?.title).toBe("Strong Wind");
    expect(wind?.sentence).toMatch(/60 km\/h/);
  });
});

describe("buildWeatherHeadlines — unavailable data", () => {
  it("returns null when there are no samples at all, never a guessed headline", () => {
    expect(buildWeatherHeadlines(weatherAnalysis({ samples: [] }), r)).toBeNull();
  });
});
