/** Test-only builders for `lib/timing/` — not imported by any application code. Builds a lightweight `ExpectedCommuteDurationV0` fixture directly, since these tests exercise the TIMING logic, not duration's own computation (already covered by `lib/duration/`'s own tests). */
import type { DelayContribution, DurationDataCoverage, ExpectedCommuteDurationV0 } from "@/lib/duration/types";

export function durationContribution(overrides: Partial<DelayContribution> = {}): DelayContribution {
  return {
    key: "test",
    label: "Test",
    centralMinutes: 0,
    lowerMinutes: 0,
    upperMinutes: 0,
    provenance: "heuristic-v0",
    explanation: "",
    appliesTo: "route",
    ...overrides,
  };
}

const DEFAULT_COVERAGE: DurationDataCoverage = { traffic: "complete", weather: "complete", transit: "not-applicable", roadEvents: "checked" };

export function durationFixture(overrides: Partial<ExpectedCommuteDurationV0> = {}): ExpectedCommuteDurationV0 {
  return {
    modelVersion: "winterroute-duration-v0",
    configFingerprint: "test-fingerprint",
    analyzedAt: new Date("2026-09-24T14:00:00Z"),
    baselineDurationMinutes: 43,
    centralEstimateMinutes: 43,
    lowerBoundMinutes: 43,
    upperBoundMinutes: 43,
    directlyObservedDelayMinutes: 0,
    modeledAdditionalDelayMinutes: 0,
    uncertaintyBufferMinutes: { lower: 0, upper: 0 },
    predictionStatus: "available",
    statusReasons: [],
    dataCoverage: DEFAULT_COVERAGE,
    contributingDelayFactors: [],
    explanation: [],
    notes: [],
    timingBasis: "baseline-only",
    sourceFreshness: { weatherModelsAvailable: 3, trafficRecency: "near-term", transitRecency: "not-applicable" },
    features: {} as ExpectedCommuteDurationV0["features"],
    ...overrides,
  };
}
