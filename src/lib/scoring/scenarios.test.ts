import { describe, expect, it } from "vitest";
import { computeCommuteRisk } from "./computeCommuteRisk";
import { RISK_SCENARIOS } from "./scenarios";

describe("RISK_SCENARIOS — matrix invariants", () => {
  it.each(RISK_SCENARIOS.map((s) => [s.name, s] as const))("%s: produces a bounded, non-NaN, valid result", (_name, scenario) => {
    const inputs = scenario.build();
    const risk = computeCommuteRisk(inputs);

    expect(Number.isNaN(risk.overallIndex)).toBe(false);
    expect(risk.overallIndex).toBeGreaterThanOrEqual(0);
    expect(risk.overallIndex).toBeLessThanOrEqual(100);
    expect(["Low", "Moderate", "High", "Very High"]).toContain(risk.label);
    expect(["available", "limited-data", "insufficient-data"]).toContain(risk.predictionStatus);

    for (const factor of Object.values(risk.factors)) {
      if (factor.status === "scored") {
        expect(Number.isNaN(factor.score)).toBe(false);
        expect(factor.score).toBeGreaterThanOrEqual(0);
        expect(factor.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("produces a spread of overall indices across the full matrix, not a compressed/saturated distribution", () => {
    const indices = RISK_SCENARIOS.map((s) => computeCommuteRisk(s.build()).overallIndex);
    expect(Math.min(...indices)).toBeLessThan(15);
    expect(Math.max(...indices)).toBeGreaterThan(50);
    expect(new Set(indices).size).toBeGreaterThan(indices.length / 2);
  });

  it("never reports 'insufficient-data' for a scenario with real applicable evidence present", () => {
    for (const scenario of RISK_SCENARIOS.filter((s) => s.category !== "providerFailure")) {
      const risk = computeCommuteRisk(scenario.build());
      expect(risk.predictionStatus, `${scenario.name} unexpectedly insufficient`).not.toBe("insufficient-data");
    }
  });

  it("orders transit disruption scenarios sensibly: canceled > major delay > minor delay > schedule-only", () => {
    const byName = (name: string) => {
      const scenario = RISK_SCENARIOS.find((s) => s.name === name);
      if (!scenario) throw new Error(`missing scenario: ${name}`);
      return computeCommuteRisk(scenario.build()).factors.transit.score ?? 0;
    };
    const scheduleOnly = byName("Transit — schedule only");
    const minorDelay = byName("Transit — realtime, minor delay");
    const majorDelay = byName("Transit — realtime, major delay");
    const canceled = byName("Transit — canceled trip");

    expect(minorDelay).toBeGreaterThanOrEqual(scheduleOnly);
    expect(majorDelay).toBeGreaterThanOrEqual(minorDelay);
    expect(canceled).toBeGreaterThan(majorDelay);
  });

  it("orders traffic scenarios sensibly: severe > moderate > none", () => {
    const byName = (name: string) => {
      const scenario = RISK_SCENARIOS.find((s) => s.name === name);
      if (!scenario) throw new Error(`missing scenario: ${name}`);
      return computeCommuteRisk(scenario.build()).factors.traffic.score ?? 0;
    };
    expect(byName("Traffic — moderate (car)")).toBeGreaterThan(byName("Traffic — none (car)"));
    expect(byName("Traffic — severe (car)")).toBeGreaterThan(byName("Traffic — moderate (car)"));
  });

  it("marks the transit-realtime-unavailable provider-failure scenario as still valid (schedule-only), not insufficient", () => {
    const scenario = RISK_SCENARIOS.find((s) => s.name === "Provider failure — transit realtime unavailable (schedule survives)");
    if (!scenario) throw new Error("missing scenario");
    const risk = computeCommuteRisk(scenario.build());
    expect(risk.predictionStatus).not.toBe("insufficient-data");
    expect(risk.factors.transit.status).toBe("scored");
  });

  it("marks the all-sources-unavailable provider-failure scenario as insufficient, never a fabricated Low", () => {
    const scenario = RISK_SCENARIOS.find((s) => s.name === "Provider failure — all applicable sources unavailable (drive)");
    if (!scenario) throw new Error("missing scenario");
    const risk = computeCommuteRisk(scenario.build());
    expect(risk.predictionStatus).toBe("insufficient-data");
  });
});
