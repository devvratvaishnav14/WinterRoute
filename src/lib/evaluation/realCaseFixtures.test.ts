import { describe, expect, it } from "vitest";
import { REAL_CASE_FIXTURES } from "./realCaseFixtures";

describe("REAL_CASE_FIXTURES", () => {
  it("builds every fixture without throwing, each with a bounded, non-NaN index", () => {
    for (const [name, build] of Object.entries(REAL_CASE_FIXTURES)) {
      const snapshot = build();
      expect(Number.isNaN(snapshot.overallIndex), name).toBe(false);
      expect(snapshot.overallIndex).toBeGreaterThanOrEqual(0);
      expect(snapshot.overallIndex).toBeLessThanOrEqual(100);
    }
  });

  it("uses generic route labels, never a real street address", () => {
    for (const build of Object.values(REAL_CASE_FIXTURES)) {
      const snapshot = build();
      expect(snapshot.tripContext.originLabel).not.toMatch(/\d+ .+ (st|ave|rd|blvd)/i);
    }
  });

  it("the low-disruption car case scores meaningfully lower than the precipitation case", () => {
    const low = REAL_CASE_FIXTURES.lowDisruptionCar();
    const precip = REAL_CASE_FIXTURES.precipitation();
    expect(precip.overallIndex).toBeGreaterThan(low.overallIndex);
  });

  it("the transit schedule-only case has no fabricated delay", () => {
    const snapshot = REAL_CASE_FIXTURES.transitScheduleOnly();
    expect(snapshot.factorScores.transit.status).toBe("scored");
    expect(snapshot.dataCoverage.transit).toBe("scheduled-only");
  });
});
