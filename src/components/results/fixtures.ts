/**
 * Small synthetic-data builders shared by `components/results/`'s test
 * files — not imported by any application code. Reuses `lib/scoring/`'s
 * Route/Weather/Traffic/Transit builders (the same underlying domain
 * shapes) and adds minimal Risk/Duration/Timing fixtures, since these UI
 * tests only care that the RIGHT PROPS produce the RIGHT RENDERED TEXT,
 * never re-deriving the model computations themselves.
 */
import type { ExperimentalCommuteRiskV0, RiskFactorKey } from "@/lib/scoring/types";
import { durationFixture } from "@/lib/timing/fixtures";
import type { CommuteTimingRecommendationV0 } from "@/lib/timing/types";
import type { RiskPreviewState } from "@/components/trip/RiskPreview";
import type { DurationPreviewState } from "@/components/trip/DurationPreview";
import type { TimingPreviewState } from "@/components/trip/TimingPreview";

export * from "@/lib/scoring/fixtures";
export { durationFixture };

export function riskFixture(overrides: Partial<ExperimentalCommuteRiskV0> = {}): ExperimentalCommuteRiskV0 {
  return {
    modelVersion: "winterroute-risk-v0",
    configFingerprint: "test-fingerprint",
    analyzedAt: new Date("2026-09-24T14:00:00Z"),
    overallIndex: 20,
    label: "Low",
    predictionStatus: "available",
    sufficiency: {} as ExperimentalCommuteRiskV0["sufficiency"],
    factors: {} as Record<RiskFactorKey, ExperimentalCommuteRiskV0["factors"][RiskFactorKey]>,
    weighting: [],
    contributions: [],
    dominantFactors: [],
    explanation: [],
    dataCoverage: {} as ExperimentalCommuteRiskV0["dataCoverage"],
    features: {} as ExperimentalCommuteRiskV0["features"],
    ...overrides,
  };
}

export function riskState(overrides: Partial<ExperimentalCommuteRiskV0> = {}): RiskPreviewState {
  return {
    status: "success",
    risk: riskFixture(overrides),
    snapshotContext: {} as RiskPreviewState["snapshotContext"],
  };
}

export function durationState(overrides: Partial<ReturnType<typeof durationFixture>> = {}): DurationPreviewState {
  return { status: "success", duration: durationFixture(overrides) };
}

export function timingFixture(overrides: Partial<CommuteTimingRecommendationV0> = {}): CommuteTimingRecommendationV0 {
  return {
    modelVersion: "winterroute-timing-v0",
    configFingerprint: "test-fingerprint",
    analyzedAt: new Date("2026-09-24T14:00:00Z"),
    preference: "arriveBy",
    status: "available",
    statusReasons: [],
    summarySentences: [],
    explanation: [],
    notes: [],
    dataCoverage: { traffic: "complete", weather: "complete", transit: "not-applicable", roadEvents: "checked" },
    durationPredictionReference: {
      modelVersion: "winterroute-duration-v0",
      configFingerprint: "test-fingerprint",
      predictionStatus: "available",
      baselineDurationMinutes: 43,
      centralEstimateMinutes: 43,
      lowerBoundMinutes: 43,
      upperBoundMinutes: 43,
    },
    ...overrides,
  };
}

export function timingState(overrides: Partial<CommuteTimingRecommendationV0> = {}): TimingPreviewState {
  return { status: "success", timing: timingFixture(overrides) };
}
