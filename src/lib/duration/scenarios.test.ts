import { describe, expect, it } from "vitest";
import { computeExpectedDuration } from "./computeExpectedDuration";
import { DURATION_SCENARIOS } from "./scenarios";

describe("DURATION_SCENARIOS — matrix invariants", () => {
  it.each(DURATION_SCENARIOS.map((s) => [s.name, s] as const))("%s: satisfies all range invariants", (_name, scenario) => {
    const result = computeExpectedDuration(scenario.build());

    expect(Number.isNaN(result.centralEstimateMinutes)).toBe(false);
    expect(Number.isFinite(result.centralEstimateMinutes)).toBe(true);
    expect(Number.isFinite(result.lowerBoundMinutes)).toBe(true);
    expect(Number.isFinite(result.upperBoundMinutes)).toBe(true);
    expect(result.lowerBoundMinutes).toBeGreaterThanOrEqual(0);
    expect(result.lowerBoundMinutes).toBeLessThanOrEqual(result.centralEstimateMinutes);
    expect(result.centralEstimateMinutes).toBeLessThanOrEqual(result.upperBoundMinutes);
    expect(["available", "limited-data", "insufficient-data", "route-disrupted"]).toContain(result.predictionStatus);
  });

  it("orders car traffic scenarios sensibly: severe > moderate > clear", () => {
    const centralFor = (name: string) => {
      const scenario = DURATION_SCENARIOS.find((s) => s.name === name);
      if (!scenario) throw new Error(`missing scenario: ${name}`);
      return computeExpectedDuration(scenario.build()).centralEstimateMinutes;
    };
    expect(centralFor("Car — moderate traffic")).toBeGreaterThan(centralFor("Car — clear, no traffic"));
    expect(centralFor("Car — severe traffic")).toBeGreaterThan(centralFor("Car — moderate traffic"));
  });

  it("orders transit realtime delay scenarios sensibly: +15min >= +5min >= schedule-only", () => {
    const centralFor = (name: string) => {
      const scenario = DURATION_SCENARIOS.find((s) => s.name === name);
      if (!scenario) throw new Error(`missing scenario: ${name}`);
      return computeExpectedDuration(scenario.build()).centralEstimateMinutes;
    };
    expect(centralFor("Transit — +5 min realtime delay")).toBeGreaterThanOrEqual(centralFor("Transit — schedule only"));
    expect(centralFor("Transit — +15 min realtime delay")).toBeGreaterThanOrEqual(centralFor("Transit — +5 min realtime delay"));
  });

  it("marks the missed-transfer and cancellation scenarios as route-disrupted, never a precise unaffected estimate", () => {
    const statusFor = (name: string) => {
      const scenario = DURATION_SCENARIOS.find((s) => s.name === name);
      if (!scenario) throw new Error(`missing scenario: ${name}`);
      return computeExpectedDuration(scenario.build()).predictionStatus;
    };
    expect(statusFor("Transit — missed transfer")).toBe("route-disrupted");
    expect(statusFor("Transit — cancellation")).toBe("route-disrupted");
  });

  it("marks 'transit realtime unavailable (schedule survives)' as available, not limited or insufficient", () => {
    const scenario = DURATION_SCENARIOS.find((s) => s.name === "Provider failure — transit realtime unavailable (schedule survives)");
    if (!scenario) throw new Error("missing scenario");
    expect(computeExpectedDuration(scenario.build()).predictionStatus).toBe("available");
  });

  it("marks 'multiple sources unavailable' as limited-data (baseline routing still gives a crude estimate)", () => {
    const scenario = DURATION_SCENARIOS.find((s) => s.name === "Provider failure — multiple sources unavailable");
    if (!scenario) throw new Error("missing scenario");
    expect(computeExpectedDuration(scenario.build()).predictionStatus).toBe("limited-data");
  });

  it("produces a real spread of central estimates across the matrix, not a compressed distribution", () => {
    const centrals = DURATION_SCENARIOS.map((s) => computeExpectedDuration(s.build()).centralEstimateMinutes);
    expect(new Set(centrals.map((c) => Math.round(c))).size).toBeGreaterThanOrEqual(centrals.length / 3);
  });
});
