import { describe, expect, it } from "vitest";
import { combineContributions, directlyObservedDelayMinutes, modeledAdditionalDelayMinutes } from "./combine";
import type { DelayContribution } from "./types";

function contribution(overrides: Partial<DelayContribution> = {}): DelayContribution {
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

describe("combineContributions", () => {
  it("sums deltas against the baseline", () => {
    const result = combineContributions(40, [contribution({ centralMinutes: 5, lowerMinutes: 5, upperMinutes: 10 })]);
    expect(result.centralEstimateMinutes).toBe(45);
    expect(result.lowerBoundMinutes).toBe(45);
    expect(result.upperBoundMinutes).toBe(50);
  });

  it("allows the central estimate to land below baseline when a contribution is negative", () => {
    const result = combineContributions(28, [contribution({ centralMinutes: -4, lowerMinutes: -4, upperMinutes: -4 })]);
    expect(result.centralEstimateMinutes).toBe(24);
  });

  it("never lets lowerBound exceed centralEstimate", () => {
    const result = combineContributions(40, [contribution({ centralMinutes: 5, lowerMinutes: 8, upperMinutes: 10 })]);
    expect(result.lowerBoundMinutes).toBeLessThanOrEqual(result.centralEstimateMinutes);
  });

  it("never lets upperBound fall below centralEstimate", () => {
    const result = combineContributions(40, [contribution({ centralMinutes: 10, lowerMinutes: 0, upperMinutes: 5 })]);
    expect(result.upperBoundMinutes).toBeGreaterThanOrEqual(result.centralEstimateMinutes);
  });

  it("never lets lowerBound go negative", () => {
    const result = combineContributions(5, [contribution({ centralMinutes: -10, lowerMinutes: -10, upperMinutes: -10 })]);
    expect(result.lowerBoundMinutes).toBeGreaterThanOrEqual(0);
    expect(result.centralEstimateMinutes).toBeGreaterThanOrEqual(0);
  });

  it("produces no NaN or Infinity with an empty contribution list", () => {
    const result = combineContributions(30, []);
    expect(Number.isFinite(result.centralEstimateMinutes)).toBe(true);
    expect(Number.isFinite(result.lowerBoundMinutes)).toBe(true);
    expect(Number.isFinite(result.upperBoundMinutes)).toBe(true);
  });
});

describe("directlyObservedDelayMinutes", () => {
  it("sums only observed-provider and derived contributions", () => {
    const total = directlyObservedDelayMinutes([
      contribution({ provenance: "observed-provider", centralMinutes: 8 }),
      contribution({ provenance: "derived", centralMinutes: 3 }),
      contribution({ provenance: "heuristic-v0", centralMinutes: 100 }),
    ]);
    expect(total).toBe(11);
  });

  it("is clamped to non-negative for display", () => {
    const total = directlyObservedDelayMinutes([contribution({ provenance: "observed-provider", centralMinutes: -4 })]);
    expect(total).toBe(0);
  });
});

describe("modeledAdditionalDelayMinutes", () => {
  it("sums only heuristic-v0 central contributions", () => {
    const total = modeledAdditionalDelayMinutes([
      contribution({ provenance: "heuristic-v0", centralMinutes: 2 }),
      contribution({ provenance: "observed-provider", centralMinutes: 8 }),
    ]);
    expect(total).toBe(2);
  });
});
