import { describe, expect, it } from "vitest";
import { buildDominantFactors, buildExplanation } from "./explanation";
import type { CommuteFeatureSet, FactorScore, RiskContribution, RiskFactorKey } from "./types";

function baseFeatures(overrides: Partial<CommuteFeatureSet> = {}): CommuteFeatureSet {
  return {
    originLabel: "A",
    destinationLabel: "B",
    temporal: { hourOfDay: 8, weekday: "thursday", isWeekend: false, isLikelyRushHour: true, forecastHorizonHours: 1, segmentCount: 1, transportComposition: [] },
    weather: { availability: "complete", modelsAvailable: 3, samplePointCount: 3, relevantAlertCount: 0, alertTypes: [], freezingRelatedAlert: false, notableWeatherExposureShare: 0 },
    traffic: { availability: "not-applicable" },
    roadEvents: { availability: "checked", relevantEventCount: 0, incidentCount: 0, constructionCount: 0, specialEventCount: 0, weatherRelatedEventCount: 0, majorSeverityEventCount: 0 },
    transit: { availability: "not-applicable", transitSegmentCount: 0, realtimeMatchedSegmentCount: 0, scheduleOnlySegmentCount: 0, unmatchedSegmentCount: 0, canceledSegmentCount: 0, skippedStopSegmentCount: 0, relevantSegmentAlertCount: 0, relevantSystemAlertCount: 0, relevantAlertEffects: [], transferCount: 0 },
    segments: [],
    dataCoverage: { weather: "complete", traffic: "not-applicable", transit: "not-applicable", roadEvents: "checked", weatherModelsAvailable: 3, weatherSamplePoints: 3, transitRealtimeMatchedSegments: 0 },
    ...overrides,
  };
}

function contribution(factor: RiskFactorKey, weightedContribution: number): RiskContribution {
  return { factor, label: factor, score: weightedContribution, weight: 1, weightedContribution };
}

describe("buildExplanation", () => {
  it("describes clear weather and no traffic delay factually", () => {
    const features = baseFeatures({ traffic: { availability: "available", trafficDelayMinutes: 0 } });
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 5, contributions: [] },
      traffic: { factor: "traffic", status: "scored", score: 0, contributions: [] },
      transit: { factor: "transit", status: "not-applicable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 0, contributions: [] },
    };
    const contributions = [contribution("weather", 5), contribution("traffic", 0), contribution("roadEvents", 0)];
    const explanation = buildExplanation(features, factors, contributions);
    expect(explanation.some((s) => s.includes("no notable precipitation"))).toBe(true);
    expect(explanation.some((s) => s.includes("no significant delay"))).toBe(true);
  });

  it("never produces a sentence for a not-applicable or unavailable factor", () => {
    const features = baseFeatures();
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 10, contributions: [] },
      traffic: { factor: "traffic", status: "not-applicable", contributions: [] },
      transit: { factor: "transit", status: "unavailable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 0, contributions: [] },
    };
    const contributions = [contribution("weather", 10), contribution("roadEvents", 0)];
    const explanation = buildExplanation(features, factors, contributions);
    expect(explanation).toHaveLength(2);
  });

  it("mentions a cancellation when one is present", () => {
    const features = baseFeatures({
      transit: { availability: "available", transitSegmentCount: 1, realtimeMatchedSegmentCount: 1, scheduleOnlySegmentCount: 0, unmatchedSegmentCount: 0, canceledSegmentCount: 1, skippedStopSegmentCount: 0, relevantSegmentAlertCount: 0, relevantSystemAlertCount: 0, relevantAlertEffects: [], transferCount: 0 },
    });
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "not-applicable", contributions: [] },
      traffic: { factor: "traffic", status: "not-applicable", contributions: [] },
      transit: { factor: "transit", status: "scored", score: 92, contributions: [] },
      roadEvents: { factor: "roadEvents", status: "not-applicable", contributions: [] },
    };
    const explanation = buildExplanation(features, factors, [contribution("transit", 92)]);
    expect(explanation[0]).toContain("canceled");
  });
});

describe("buildExplanation — pluralization", () => {
  it("uses singular '1 alert', never '1 alert(s)', for a single ECCC alert", () => {
    const features = baseFeatures({ weather: { availability: "complete", modelsAvailable: 3, samplePointCount: 3, relevantAlertCount: 1, alertTypes: ["warning"], freezingRelatedAlert: false, notableWeatherExposureShare: 0 } });
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 20, contributions: [] },
      traffic: { factor: "traffic", status: "not-applicable", contributions: [] },
      transit: { factor: "transit", status: "not-applicable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 0, contributions: [] },
    };
    const explanation = buildExplanation(features, factors, [contribution("weather", 20), contribution("roadEvents", 0)]);
    expect(explanation.some((s) => s.includes("1 official ECCC alert "))).toBe(true);
    expect(explanation.some((s) => s.includes("(s)"))).toBe(false);
  });

  it("uses plural '2 alerts' for multiple ECCC alerts", () => {
    const features = baseFeatures({ weather: { availability: "complete", modelsAvailable: 3, samplePointCount: 3, relevantAlertCount: 2, alertTypes: ["warning", "watch"], freezingRelatedAlert: false, notableWeatherExposureShare: 0 } });
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 20, contributions: [] },
      traffic: { factor: "traffic", status: "not-applicable", contributions: [] },
      transit: { factor: "transit", status: "not-applicable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 0, contributions: [] },
    };
    const explanation = buildExplanation(features, factors, [contribution("weather", 20), contribution("roadEvents", 0)]);
    expect(explanation.some((s) => s.includes("2 official ECCC alerts "))).toBe(true);
  });

  it("uses singular '1 minute' for a 1-minute traffic delay", () => {
    const features = baseFeatures({ traffic: { availability: "available", trafficDelayMinutes: 1 } });
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 0, contributions: [] },
      traffic: { factor: "traffic", status: "scored", score: 10, contributions: [] },
      transit: { factor: "transit", status: "not-applicable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 0, contributions: [] },
    };
    const explanation = buildExplanation(features, factors, [contribution("traffic", 10), contribution("weather", 0), contribution("roadEvents", 0)]);
    expect(explanation.some((s) => s.includes("about 1 minute "))).toBe(true);
  });

  it("uses plural '2 minutes' for a multi-minute traffic delay", () => {
    const features = baseFeatures({ traffic: { availability: "available", trafficDelayMinutes: 2 } });
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 0, contributions: [] },
      traffic: { factor: "traffic", status: "scored", score: 10, contributions: [] },
      transit: { factor: "transit", status: "not-applicable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 0, contributions: [] },
    };
    const explanation = buildExplanation(features, factors, [contribution("traffic", 10), contribution("weather", 0), contribution("roadEvents", 0)]);
    expect(explanation.some((s) => s.includes("about 2 minutes "))).toBe(true);
  });

  it("uses correct singular subject-verb agreement for 1 canceled transit segment", () => {
    const features = baseFeatures({
      transit: { availability: "available", transitSegmentCount: 1, realtimeMatchedSegmentCount: 1, scheduleOnlySegmentCount: 0, unmatchedSegmentCount: 0, canceledSegmentCount: 1, skippedStopSegmentCount: 0, relevantSegmentAlertCount: 0, relevantSystemAlertCount: 0, relevantAlertEffects: [], transferCount: 0 },
    });
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 0, contributions: [] },
      traffic: { factor: "traffic", status: "not-applicable", contributions: [] },
      transit: { factor: "transit", status: "scored", score: 90, contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 0, contributions: [] },
    };
    const explanation = buildExplanation(features, factors, [contribution("transit", 90)]);
    expect(explanation[0]).toBe("1 matched transit segment on this route is currently reported canceled.");
  });

  it("uses correct plural subject-verb agreement for multiple canceled transit segments", () => {
    const features = baseFeatures({
      transit: { availability: "available", transitSegmentCount: 2, realtimeMatchedSegmentCount: 2, scheduleOnlySegmentCount: 0, unmatchedSegmentCount: 0, canceledSegmentCount: 2, skippedStopSegmentCount: 0, relevantSegmentAlertCount: 0, relevantSystemAlertCount: 0, relevantAlertEffects: [], transferCount: 0 },
    });
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 0, contributions: [] },
      traffic: { factor: "traffic", status: "not-applicable", contributions: [] },
      transit: { factor: "transit", status: "scored", score: 90, contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 0, contributions: [] },
    };
    const explanation = buildExplanation(features, factors, [contribution("transit", 90)]);
    expect(explanation[0]).toBe("2 matched transit segments on this route are currently reported canceled.");
  });

  it("uses singular '1 event' with correct verb agreement for a single road event", () => {
    const features = baseFeatures({ roadEvents: { availability: "checked", relevantEventCount: 1, incidentCount: 1, constructionCount: 0, specialEventCount: 0, weatherRelatedEventCount: 0, majorSeverityEventCount: 0, highestSeverity: "minor" } });
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 0, contributions: [] },
      traffic: { factor: "traffic", status: "not-applicable", contributions: [] },
      transit: { factor: "transit", status: "not-applicable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 10, contributions: [] },
    };
    const explanation = buildExplanation(features, factors, [contribution("roadEvents", 10), contribution("weather", 0)]);
    expect(explanation.some((s) => s.startsWith('1 relevant road event was found near the route, the most severe rated "minor"'))).toBe(true);
  });

  it("uses plural '2 events' with correct verb agreement for multiple road events", () => {
    const features = baseFeatures({ roadEvents: { availability: "checked", relevantEventCount: 2, incidentCount: 2, constructionCount: 0, specialEventCount: 0, weatherRelatedEventCount: 0, majorSeverityEventCount: 0, highestSeverity: "moderate" } });
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 0, contributions: [] },
      traffic: { factor: "traffic", status: "not-applicable", contributions: [] },
      transit: { factor: "transit", status: "not-applicable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 10, contributions: [] },
    };
    const explanation = buildExplanation(features, factors, [contribution("roadEvents", 10), contribution("weather", 0)]);
    expect(explanation.some((s) => s.startsWith('2 relevant road events were found near the route, the most severe rated "moderate"'))).toBe(true);
  });
});

describe("buildDominantFactors", () => {
  it("returns the top contributors' most specific sub-factor labels", () => {
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 60, contributions: [{ key: "snowfall", label: "Snowfall", rawValue: 60, weight: 1, detail: "" }] },
      traffic: { factor: "traffic", status: "scored", score: 80, contributions: [{ key: "delay", label: "Traffic delay", rawValue: 80, weight: 1, detail: "" }] },
      transit: { factor: "transit", status: "not-applicable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 5, contributions: [] },
    };
    const contributions = [contribution("traffic", 80), contribution("weather", 60), contribution("roadEvents", 5)];
    const dominant = buildDominantFactors(factors, contributions, 2);
    expect(dominant).toEqual(["Traffic delay", "Snowfall"]);
  });

  it("excludes a zero-weighted contribution from the dominant list", () => {
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 0, contributions: [] },
      traffic: { factor: "traffic", status: "not-applicable", contributions: [] },
      transit: { factor: "transit", status: "not-applicable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 0, contributions: [] },
    };
    const dominant = buildDominantFactors(factors, [contribution("weather", 0), contribution("roadEvents", 0)]);
    expect(dominant).toEqual([]);
  });

  it("never returns more than the requested count", () => {
    const factors: Record<RiskFactorKey, FactorScore> = {
      weather: { factor: "weather", status: "scored", score: 90, contributions: [] },
      traffic: { factor: "traffic", status: "scored", score: 80, contributions: [] },
      transit: { factor: "transit", status: "not-applicable", contributions: [] },
      roadEvents: { factor: "roadEvents", status: "scored", score: 70, contributions: [] },
    };
    const dominant = buildDominantFactors(factors, [contribution("weather", 90), contribution("traffic", 80), contribution("roadEvents", 70)], 2);
    expect(dominant.length).toBeLessThanOrEqual(2);
  });
});
