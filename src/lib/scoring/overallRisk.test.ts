import { describe, expect, it } from "vitest";
import { computeOverallRisk, labelFor } from "./overallRisk";
import type { CommuteFeatureSet, FactorScore, RiskFactorKey } from "./types";

function baseFeatures(overrides: Partial<CommuteFeatureSet> = {}): CommuteFeatureSet {
  return {
    originLabel: "A",
    destinationLabel: "B",
    temporal: {
      hourOfDay: 8,
      weekday: "thursday",
      isWeekend: false,
      isLikelyRushHour: true,
      forecastHorizonHours: 1,
      segmentCount: 1,
      transportComposition: [],
    },
    weather: { availability: "complete", modelsAvailable: 3, samplePointCount: 3, relevantAlertCount: 0, alertTypes: [], freezingRelatedAlert: false, notableWeatherExposureShare: 0 },
    traffic: { availability: "not-applicable" },
    roadEvents: { availability: "checked", relevantEventCount: 0, incidentCount: 0, constructionCount: 0, specialEventCount: 0, weatherRelatedEventCount: 0, majorSeverityEventCount: 0 },
    transit: { availability: "not-applicable", transitSegmentCount: 0, realtimeMatchedSegmentCount: 0, scheduleOnlySegmentCount: 0, unmatchedSegmentCount: 0, canceledSegmentCount: 0, skippedStopSegmentCount: 0, relevantSegmentAlertCount: 0, relevantSystemAlertCount: 0, relevantAlertEffects: [], transferCount: 0 },
    segments: [{ segmentId: "s1", mode: "walk", durationMinutes: 20, routeDurationShare: 1, weather: { availability: "available", sampleCount: 1, belowFreezingTemperature: false, precipitationNearFreezing: false, snowfallPresent: false }, traffic: { availability: "not-applicable" }, transit: { availability: "not-applicable", isCanceled: false, hasSkippedStop: false, relevantAlertCount: 0 }, roadEvents: { availability: "checked", relevantEventCount: 0, incidentCount: 0, constructionCount: 0, weatherRelatedEventCount: 0, majorSeverityEventCount: 0 } }],
    dataCoverage: { weather: "complete", traffic: "not-applicable", transit: "not-applicable", roadEvents: "checked", weatherModelsAvailable: 3, weatherSamplePoints: 3, transitRealtimeMatchedSegments: 0 },
    ...overrides,
  };
}

function factorScore(factor: RiskFactorKey, status: FactorScore["status"], score?: number): FactorScore {
  return { factor, status, score, contributions: [] };
}

describe("computeOverallRisk", () => {
  it("excludes not-applicable factors from the denominator entirely, rather than diluting with an implicit zero (walk trip)", () => {
    const features = baseFeatures(); // pure walk: traffic/transit not-applicable
    const factors = {
      weather: factorScore("weather", "scored", 80),
      traffic: factorScore("traffic", "not-applicable"),
      transit: factorScore("transit", "not-applicable"),
      roadEvents: factorScore("roadEvents", "scored", 0),
    };
    const result = computeOverallRisk(features, factors);
    // Only weather and roadEvents are applicable; weather dominates a walk trip's weighting heavily.
    // If traffic/transit had been averaged in as 0, the index would be far lower than this.
    expect(result.overallIndex).toBeGreaterThan(50);
  });

  it("normalized weights of applicable factors sum to 1", () => {
    const features = baseFeatures();
    const factors = {
      weather: factorScore("weather", "scored", 50),
      traffic: factorScore("traffic", "not-applicable"),
      transit: factorScore("transit", "not-applicable"),
      roadEvents: factorScore("roadEvents", "scored", 20),
    };
    const result = computeOverallRisk(features, factors);
    const sum = result.weighting.filter((w) => w.normalizedWeight !== undefined).reduce((s, w) => s + (w.normalizedWeight ?? 0), 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("returns 0 (bounded, never NaN) when every factor is unavailable/not-applicable", () => {
    const features = baseFeatures();
    const factors = {
      weather: factorScore("weather", "unavailable"),
      traffic: factorScore("traffic", "not-applicable"),
      transit: factorScore("transit", "not-applicable"),
      roadEvents: factorScore("roadEvents", "unavailable"),
    };
    const result = computeOverallRisk(features, factors);
    expect(result.overallIndex).toBe(0);
    expect(Number.isNaN(result.overallIndex)).toBe(false);
    expect(result.contributions).toEqual([]);
  });

  it("is always bounded between 0 and 100", () => {
    const features = baseFeatures();
    const factors = {
      weather: factorScore("weather", "scored", 100),
      traffic: factorScore("traffic", "scored", 100),
      transit: factorScore("transit", "scored", 100),
      roadEvents: factorScore("roadEvents", "scored", 100),
    };
    const result = computeOverallRisk(features, factors);
    expect(result.overallIndex).toBeLessThanOrEqual(100);
    expect(result.overallIndex).toBeGreaterThanOrEqual(0);
  });

  it("reflects actual segment-duration composition for a mixed trip (mostly-drive vs mostly-walk)", () => {
    const segmentPair = (driveShare: number) => [
      { segmentId: "s1", mode: "drive" as const, durationMinutes: driveShare * 60, routeDurationShare: driveShare, weather: { availability: "available" as const, sampleCount: 1, belowFreezingTemperature: false, precipitationNearFreezing: false, snowfallPresent: false }, traffic: { availability: "available" as const }, transit: { availability: "not-applicable" as const, isCanceled: false, hasSkippedStop: false, relevantAlertCount: 0 }, roadEvents: { availability: "checked" as const, relevantEventCount: 0, incidentCount: 0, constructionCount: 0, weatherRelatedEventCount: 0, majorSeverityEventCount: 0 } },
      { segmentId: "s2", mode: "walk" as const, durationMinutes: (1 - driveShare) * 60, routeDurationShare: 1 - driveShare, weather: { availability: "available" as const, sampleCount: 1, belowFreezingTemperature: false, precipitationNearFreezing: false, snowfallPresent: false }, traffic: { availability: "not-applicable" as const }, transit: { availability: "not-applicable" as const, isCanceled: false, hasSkippedStop: false, relevantAlertCount: 0 }, roadEvents: { availability: "checked" as const, relevantEventCount: 0, incidentCount: 0, constructionCount: 0, weatherRelatedEventCount: 0, majorSeverityEventCount: 0 } },
    ];

    const factors = {
      weather: factorScore("weather", "scored", 10),
      traffic: factorScore("traffic", "scored", 90),
      transit: factorScore("transit", "not-applicable"),
      roadEvents: factorScore("roadEvents", "scored", 10),
    };

    const mostlyDrive = computeOverallRisk(baseFeatures({ segments: segmentPair(0.9) }), factors);
    const mostlyWalk = computeOverallRisk(baseFeatures({ segments: segmentPair(0.1) }), factors);

    const trafficWeight = (result: ReturnType<typeof computeOverallRisk>) =>
      result.weighting.find((w) => w.factor === "traffic")?.normalizedWeight ?? 0;

    // A 90%-drive trip must give traffic meaningfully more weight than a 90%-walk trip — the
    // overall index should shift with the route's actual segment composition, not just its mode label.
    expect(trafficWeight(mostlyDrive)).toBeGreaterThan(trafficWeight(mostlyWalk));
    expect(mostlyDrive.overallIndex).toBeGreaterThan(mostlyWalk.overallIndex);
  });

  it("sorts contributions descending by weighted contribution", () => {
    const features = baseFeatures();
    const factors = {
      weather: factorScore("weather", "scored", 20),
      traffic: factorScore("traffic", "not-applicable"),
      transit: factorScore("transit", "not-applicable"),
      roadEvents: factorScore("roadEvents", "scored", 90),
    };
    const result = computeOverallRisk(features, factors);
    for (let i = 1; i < result.contributions.length; i++) {
      expect(result.contributions[i].weightedContribution).toBeLessThanOrEqual(result.contributions[i - 1].weightedContribution);
    }
  });

  it("labels the index using the centrally configured thresholds", () => {
    const features = baseFeatures();
    const low = computeOverallRisk(features, { weather: factorScore("weather", "scored", 5), traffic: factorScore("traffic", "not-applicable"), transit: factorScore("transit", "not-applicable"), roadEvents: factorScore("roadEvents", "scored", 0) });
    const veryHigh = computeOverallRisk(features, { weather: factorScore("weather", "scored", 95), traffic: factorScore("traffic", "not-applicable"), transit: factorScore("transit", "not-applicable"), roadEvents: factorScore("roadEvents", "scored", 95) });
    expect(low.label).toBe("Low");
    expect(veryHigh.label).toBe("Very High");
  });
});

describe("labelFor — exact threshold boundaries", () => {
  it("Low/Moderate boundary at 30", () => {
    expect(labelFor(29)).toBe("Low");
    expect(labelFor(29.9)).toBe("Low");
    expect(labelFor(30)).toBe("Moderate");
    expect(labelFor(30.1)).toBe("Moderate");
  });

  it("Moderate/High boundary at 55", () => {
    expect(labelFor(54)).toBe("Moderate");
    expect(labelFor(54.9)).toBe("Moderate");
    expect(labelFor(55)).toBe("High");
    expect(labelFor(55.1)).toBe("High");
  });

  it("High/Very High boundary at 75", () => {
    expect(labelFor(74)).toBe("High");
    expect(labelFor(74.9)).toBe("High");
    expect(labelFor(75)).toBe("Very High");
    expect(labelFor(75.1)).toBe("Very High");
  });

  it("covers the extreme ends", () => {
    expect(labelFor(0)).toBe("Low");
    expect(labelFor(100)).toBe("Very High");
  });
});
