/** Test-only builders for `lib/evaluation/`'s types — not imported by any application code. */
import { computeExpectedDuration } from "@/lib/duration/computeExpectedDuration";
import { computeCommuteRisk } from "@/lib/scoring/computeCommuteRisk";
import { computeTimingRecommendation } from "@/lib/timing/computeTimingRecommendation";
import {
  forecast,
  route,
  segment,
  trafficAnalysis,
  trafficResult,
  transitAnalysis,
  weatherAnalysis,
  weatherSample,
} from "@/lib/scoring/fixtures";
import { createPredictionSnapshot } from "./createSnapshot";
import type { CommuteOutcome, PredictionSnapshot } from "./types";

const NOW = new Date("2026-09-24T14:00:00Z");

export function buildTestSnapshot(overrides: Partial<Parameters<typeof createPredictionSnapshot>[0]> = {}): PredictionSnapshot {
  const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
  const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 10 })])] });
  const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 3 }) } });
  const transit = transitAnalysis({ status: "not-applicable", reason: "no transit segments" });

  const risk = computeCommuteRisk({ route: r, weather, traffic, transit, now: NOW });

  return createPredictionSnapshot({
    risk,
    requestedMode: "car",
    timePreference: "leaveAt",
    selectedTripTime: NOW,
    weather,
    traffic,
    transit,
    predictionId: "test-prediction-1",
    ...overrides,
  });
}

/** Same as `buildTestSnapshot`, but also computes and attaches a duration prediction for the same trip. */
export function buildTestSnapshotWithDuration(
  overrides: Partial<Parameters<typeof createPredictionSnapshot>[0]> = {},
): PredictionSnapshot {
  const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
  const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 10 })])] });
  const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 3, trafficAwareDurationMinutes: 33 }) } });
  const transit = transitAnalysis({ status: "not-applicable", reason: "no transit segments" });

  const risk = computeCommuteRisk({ route: r, weather, traffic, transit, now: NOW });
  const duration = computeExpectedDuration({ route: r, weather, traffic, transit, now: NOW });

  return createPredictionSnapshot({
    risk,
    duration,
    requestedMode: "car",
    timePreference: "leaveAt",
    selectedTripTime: NOW,
    weather,
    traffic,
    transit,
    predictionId: "test-prediction-1",
    ...overrides,
  });
}

/** Same as `buildTestSnapshotWithDuration`, but also computes and attaches an Arrive-By timing recommendation for the same trip. */
export function buildTestSnapshotWithTiming(
  overrides: Partial<Parameters<typeof createPredictionSnapshot>[0]> = {},
): PredictionSnapshot {
  const r = route([segment({ id: "s1", mode: "drive", durationMinutes: 30 })]);
  const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 10 })])] });
  const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 3, trafficAwareDurationMinutes: 33 }) } });
  const transit = transitAnalysis({ status: "not-applicable", reason: "no transit segments" });
  const targetArrival = new Date("2026-09-24T15:00:00Z");

  const risk = computeCommuteRisk({ route: r, weather, traffic, transit, now: NOW });
  const duration = computeExpectedDuration({ route: r, weather, traffic, transit, now: NOW });
  const timing = computeTimingRecommendation({ duration, preference: "arriveBy", targetTime: targetArrival, now: NOW });

  return createPredictionSnapshot({
    risk,
    duration,
    timing,
    requestedMode: "car",
    timePreference: "arriveBy",
    selectedTripTime: targetArrival,
    weather,
    traffic,
    transit,
    predictionId: "test-prediction-1",
    ...overrides,
  });
}

export function buildTestOutcome(overrides: Partial<CommuteOutcome> = {}): CommuteOutcome {
  return {
    predictionId: "test-prediction-1",
    observationCreatedAt: new Date("2026-09-24T15:00:00Z"),
    outcomeCompleteness: "none",
    ...overrides,
  };
}
