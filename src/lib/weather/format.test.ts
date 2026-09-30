import { describe, expect, it } from "vitest";
import {
  formatPrecipitationSummary,
  formatSnowSummary,
  formatTemperatureRangeC,
  formatWindRangeKmh,
  summarizeRainForResults,
  summarizeSnowForResults,
  summarizeTemperatureForResults,
  summarizeWindForResults,
} from "./format";

describe("formatTemperatureRangeC", () => {
  it("formats a range", () => {
    expect(formatTemperatureRangeC({ min: 4.2, max: 7.1 })).toBe("4-7°C across route");
  });

  it("collapses a near-identical range to a single value", () => {
    expect(formatTemperatureRangeC({ min: 4.4, max: 4.4 })).toBe("4°C across route");
  });

  it("handles missing data", () => {
    expect(formatTemperatureRangeC(undefined)).toBe("No temperature data available");
  });
});

describe("formatWindRangeKmh", () => {
  it("formats a range", () => {
    expect(formatWindRangeKmh({ min: 15, max: 25 })).toBe("15-25 km/h");
  });
});

describe("formatPrecipitationSummary", () => {
  it("reports models predicting precipitation", () => {
    expect(formatPrecipitationSummary({ modelsPredicting: 3, modelsWithData: 3 })).toBe(
      "3/3 models predict rain on part of the route",
    );
  });

  it("reports no model predicting precipitation", () => {
    expect(formatPrecipitationSummary({ modelsPredicting: 0, modelsWithData: 3 })).toBe(
      "No model currently predicts measurable rain",
    );
  });

  it("reports no forecast data available", () => {
    expect(formatPrecipitationSummary({ modelsPredicting: 0, modelsWithData: 0 })).toBe(
      "No forecast data available",
    );
  });
});

describe("formatSnowSummary", () => {
  it("reports no model predicting snow", () => {
    expect(formatSnowSummary({ modelsPredicting: 0, modelsWithData: 3 })).toBe(
      "No model currently predicts measurable snow",
    );
  });
});

describe("summarizeRainForResults", () => {
  it("reads 'Not expected' when models had data but none predicted rain", () => {
    expect(summarizeRainForResults({ modelsPredicting: 0, modelsWithData: 3 })).toEqual({ value: "Not expected" });
  });

  it("reads 'Unavailable', never 'Not expected', when no model had data at all", () => {
    expect(summarizeRainForResults({ modelsPredicting: 0, modelsWithData: 0 })).toEqual({ value: "Unavailable" });
  });

  it("reads 'Expected along part of route' with an agreement detail when all models predicting had data agree", () => {
    expect(summarizeRainForResults({ modelsPredicting: 3, modelsWithData: 3 })).toEqual({
      value: "Expected along part of route",
      detail: "3/3 forecast models agree",
    });
  });

  it("reads 'Forecast models disagree' when only some models predict rain", () => {
    expect(summarizeRainForResults({ modelsPredicting: 1, modelsWithData: 3 })).toEqual({
      value: "Forecast models disagree",
    });
  });
});

describe("summarizeSnowForResults", () => {
  it("reads 'Not expected' when models had data but none predicted snow", () => {
    expect(summarizeSnowForResults({ modelsPredicting: 0, modelsWithData: 3 })).toEqual({ value: "Not expected" });
  });

  it("reads 'Unavailable' when no model had data at all", () => {
    expect(summarizeSnowForResults({ modelsPredicting: 0, modelsWithData: 0 })).toEqual({ value: "Unavailable" });
  });
});

describe("summarizeTemperatureForResults / summarizeWindForResults", () => {
  it("formats a compact temperature range without the technical 'across route' suffix", () => {
    expect(summarizeTemperatureForResults({ min: 7.2, max: 11.4 })).toBe("7-11°C");
  });

  it("reads 'Unavailable' for a missing temperature range", () => {
    expect(summarizeTemperatureForResults(undefined)).toBe("Unavailable");
  });

  it("formats a compact wind range", () => {
    expect(summarizeWindForResults({ min: 1.2, max: 5.9 })).toBe("1-6 km/h");
  });

  it("reads 'Unavailable' for a missing wind range", () => {
    expect(summarizeWindForResults(undefined)).toBe("Unavailable");
  });
});
