import { describe, expect, it } from "vitest";
import { buildRouteWeatherFeatures, buildSegmentWeatherFeatures } from "./weatherFeatures";
import { forecast, segment, weatherAnalysis, weatherSample } from "./fixtures";

describe("buildSegmentWeatherFeatures", () => {
  it("returns 'unavailable' when no samples are tagged with this segment", () => {
    const s = segment({ id: "seg-1" });
    const result = buildSegmentWeatherFeatures(s, [weatherSample("other-segment", [forecast()])]);
    expect(result.availability).toBe("unavailable");
    expect(result.sampleCount).toBe(0);
  });

  it("aggregates min/max across all forecasts tagged to the segment", () => {
    const s = segment({ id: "seg-1" });
    const samples = [
      weatherSample("seg-1", [forecast({ temperatureC: 5 }), forecast({ temperatureC: 8, source: { ...forecast().source, modelId: "model-b" } })]),
      weatherSample("seg-1", [forecast({ temperatureC: 2 })]),
    ];
    const result = buildSegmentWeatherFeatures(s, samples);
    expect(result.availability).toBe("available");
    expect(result.sampleCount).toBe(2);
    expect(result.minTemperatureC).toBe(2);
    expect(result.maxTemperatureC).toBe(8);
  });

  it("flags belowFreezingTemperature only when the minimum forecast is below 0°C", () => {
    const s = segment({ id: "seg-1" });
    const cold = buildSegmentWeatherFeatures(s, [weatherSample("seg-1", [forecast({ temperatureC: -2 })])]);
    const mild = buildSegmentWeatherFeatures(s, [weatherSample("seg-1", [forecast({ temperatureC: 5 })])]);
    expect(cold.belowFreezingTemperature).toBe(true);
    expect(mild.belowFreezingTemperature).toBe(false);
  });

  it("flags precipitationNearFreezing only when cold AND precipitation are both present", () => {
    const s = segment({ id: "seg-1" });
    const coldWet = buildSegmentWeatherFeatures(
      s,
      [weatherSample("seg-1", [forecast({ temperatureC: 1, precipitationMm: 3 })])],
    );
    const coldDry = buildSegmentWeatherFeatures(
      s,
      [weatherSample("seg-1", [forecast({ temperatureC: 1, precipitationMm: 0 })])],
    );
    const warmWet = buildSegmentWeatherFeatures(
      s,
      [weatherSample("seg-1", [forecast({ temperatureC: 15, precipitationMm: 3 })])],
    );
    expect(coldWet.precipitationNearFreezing).toBe(true);
    expect(coldDry.precipitationNearFreezing).toBe(false);
    expect(warmWet.precipitationNearFreezing).toBe(false);
  });

  it("flags snowfallPresent only above the notable-snowfall threshold", () => {
    const s = segment({ id: "seg-1" });
    const snowy = buildSegmentWeatherFeatures(s, [weatherSample("seg-1", [forecast({ snowfallCm: 1 })])]);
    const trace = buildSegmentWeatherFeatures(s, [weatherSample("seg-1", [forecast({ snowfallCm: 0.01 })])]);
    expect(snowy.snowfallPresent).toBe(true);
    expect(trace.snowfallPresent).toBe(false);
  });

  it("computes precipitation agreement ratio only among models that reported precipitation data", () => {
    const s = segment({ id: "seg-1" });
    const result = buildSegmentWeatherFeatures(s, [
      weatherSample("seg-1", [
        forecast({ precipitationMm: 5, source: { ...forecast().source, modelId: "a" } }),
        forecast({ precipitationMm: 0, source: { ...forecast().source, modelId: "b" } }),
        forecast({ precipitationMm: undefined, source: { ...forecast().source, modelId: "c" } }),
      ]),
    ]);
    // 1 of 2 models with precipitation data predicted > 0.
    expect(result.precipitationAgreementRatio).toBeCloseTo(0.5, 5);
  });
});

describe("buildRouteWeatherFeatures", () => {
  it("returns 'unavailable' when the weather fetch failed entirely (null)", () => {
    const result = buildRouteWeatherFeatures(null, []);
    expect(result.availability).toBe("unavailable");
  });

  it("returns 'unavailable' when the analysis has no samples", () => {
    const result = buildRouteWeatherFeatures(weatherAnalysis({ samples: [] }), []);
    expect(result.availability).toBe("unavailable");
  });

  it("returns 'complete' when all models succeeded and every segment has weather data", () => {
    const s = segment({ id: "seg-1" });
    const samples = [weatherSample("seg-1", [forecast()])];
    const segmentFeatures = [
      { segmentId: "seg-1", mode: s.mode, weather: { availability: "available" as const, sampleCount: 1, belowFreezingTemperature: false, precipitationNearFreezing: false, snowfallPresent: false }, traffic: { availability: "not-applicable" as const }, transit: { availability: "not-applicable" as const, isCanceled: false, hasSkippedStop: false, relevantAlertCount: 0 }, roadEvents: { availability: "checked" as const, relevantEventCount: 0, incidentCount: 0, constructionCount: 0, weatherRelatedEventCount: 0, majorSeverityEventCount: 0 } },
    ];
    const result = buildRouteWeatherFeatures(weatherAnalysis({ samples }), segmentFeatures);
    expect(result.availability).toBe("complete");
  });

  it("returns 'partial' when a model failed even though some data exists", () => {
    const samples = [weatherSample("seg-1", [forecast()])];
    const analysis = weatherAnalysis({
      samples,
      modelStatus: [
        { modelId: "a", displayName: "A", succeeded: true },
        { modelId: "b", displayName: "B", succeeded: false, errorMessage: "timeout" },
      ],
    });
    const result = buildRouteWeatherFeatures(analysis, []);
    expect(result.availability).toBe("partial");
  });

  it("counts relevant alerts and their types", () => {
    const samples = [weatherSample("seg-1", [forecast()])];
    const analysis = weatherAnalysis({
      samples,
      alerts: [
        { provider: "eccc", id: "1", alertType: "warning", title: "Snowfall Warning", summary: "" },
        { provider: "eccc", id: "2", alertType: "watch", title: "Frost Advisory", summary: "" },
      ],
    });
    const result = buildRouteWeatherFeatures(analysis, []);
    expect(result.relevantAlertCount).toBe(2);
    expect(result.alertTypes).toEqual(expect.arrayContaining(["warning", "watch"]));
    expect(result.freezingRelatedAlert).toBe(true);
  });

  it("does not flag freezingRelatedAlert for an unrelated alert title", () => {
    const samples = [weatherSample("seg-1", [forecast()])];
    const analysis = weatherAnalysis({
      samples,
      alerts: [{ provider: "eccc", id: "1", alertType: "advisory", title: "Air Quality Advisory", summary: "" }],
    });
    const result = buildRouteWeatherFeatures(analysis, []);
    expect(result.freezingRelatedAlert).toBe(false);
  });
});
