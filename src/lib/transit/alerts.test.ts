import { describe, expect, it } from "vitest";
import { alertActivePeriodOverlaps, matchSegmentAlerts, matchSystemAlerts } from "./alerts";
import type { TranslinkAlert } from "./providers/translinkRealtime";

function alert(overrides: Partial<TranslinkAlert> = {}): TranslinkAlert {
  return {
    id: "A1",
    cause: "CONSTRUCTION",
    effect: "MODIFIED_SERVICE",
    headerText: "Header",
    descriptionText: "Description",
    activePeriods: [],
    informedEntities: [],
    ...overrides,
  };
}

const CRITERIA = { routeId: "R099", tripId: "T1", originStopId: "SA", destinationStopId: "SB" };
const NOW = new Date("2026-09-24T15:00:00Z");

describe("alertActivePeriodOverlaps", () => {
  it("treats an alert with no active periods as always active", () => {
    expect(alertActivePeriodOverlaps(alert({ activePeriods: [] }), NOW)).toBe(true);
  });

  it("returns true when the reference time falls within a bounded period", () => {
    const a = alert({ activePeriods: [{ start: new Date("2026-09-24T14:00:00Z"), end: new Date("2026-09-24T16:00:00Z") }] });
    expect(alertActivePeriodOverlaps(a, NOW)).toBe(true);
  });

  it("returns false for an expired alert", () => {
    const a = alert({ activePeriods: [{ start: new Date("2026-09-20T00:00:00Z"), end: new Date("2026-09-21T00:00:00Z") }] });
    expect(alertActivePeriodOverlaps(a, NOW)).toBe(false);
  });

  it("returns true for a future alert whose period overlaps a future reference time", () => {
    const future = new Date("2026-10-01T00:00:00Z");
    const a = alert({ activePeriods: [{ start: new Date("2026-09-30T00:00:00Z"), end: new Date("2026-10-02T00:00:00Z") }] });
    expect(alertActivePeriodOverlaps(a, future)).toBe(true);
  });

  it("treats an open-ended start as unbounded backward", () => {
    const a = alert({ activePeriods: [{ end: new Date("2026-12-31T00:00:00Z") }] });
    expect(alertActivePeriodOverlaps(a, NOW)).toBe(true);
  });

  it("treats an open-ended end as unbounded forward", () => {
    const a = alert({ activePeriods: [{ start: new Date("2020-01-01T00:00:00Z") }] });
    expect(alertActivePeriodOverlaps(a, NOW)).toBe(true);
  });
});

describe("matchSegmentAlerts", () => {
  it("matches on route scope", () => {
    const a = alert({ informedEntities: [{ routeId: "R099" }] });
    const result = matchSegmentAlerts([a], CRITERIA, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].matchedOn).toBe("route");
  });

  it("matches on trip scope", () => {
    const a = alert({ informedEntities: [{ tripId: "T1" }] });
    const result = matchSegmentAlerts([a], CRITERIA, NOW);
    expect(result[0].matchedOn).toBe("trip");
  });

  it("matches on stop scope for the segment's own origin/destination stop only", () => {
    const a = alert({ informedEntities: [{ stopId: "SA" }] });
    expect(matchSegmentAlerts([a], CRITERIA, NOW)).toHaveLength(1);

    const unrelatedStop = alert({ informedEntities: [{ stopId: "SOMEWHERE_ELSE" }] });
    expect(matchSegmentAlerts([unrelatedStop], CRITERIA, NOW)).toHaveLength(0);
  });

  it("does not widen a stop-scoped alert to the whole route when it also names a different route", () => {
    const a = alert({ informedEntities: [{ stopId: "SA", routeId: "R999" }] });
    expect(matchSegmentAlerts([a], CRITERIA, NOW)).toHaveLength(0);
  });

  it("excludes an unrelated route/trip/stop", () => {
    const a = alert({ informedEntities: [{ routeId: "R999" }] });
    expect(matchSegmentAlerts([a], CRITERIA, NOW)).toHaveLength(0);
  });

  it("excludes a system-wide entity (no route/trip/stop) from segment-level matching", () => {
    const a = alert({ informedEntities: [{ agencyId: "TL" }] });
    expect(matchSegmentAlerts([a], CRITERIA, NOW)).toHaveLength(0);
  });

  it("excludes an alert whose active period doesn't overlap, even if entity-matched", () => {
    const a = alert({
      informedEntities: [{ routeId: "R099" }],
      activePeriods: [{ start: new Date("2020-01-01T00:00:00Z"), end: new Date("2020-01-02T00:00:00Z") }],
    });
    expect(matchSegmentAlerts([a], CRITERIA, NOW)).toHaveLength(0);
  });

  it("picks the most specific matching scope when an alert has multiple informed entities", () => {
    const a = alert({ informedEntities: [{ routeId: "R099" }, { tripId: "T1" }] });
    expect(matchSegmentAlerts([a], CRITERIA, NOW)[0].matchedOn).toBe("trip");
  });
});

describe("matchSystemAlerts", () => {
  it("matches a system-wide entity", () => {
    const a = alert({ informedEntities: [{ agencyId: "TL" }] });
    const result = matchSystemAlerts([a], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].matchedOn).toBe("agency");
  });

  it("excludes a route-scoped alert from system-wide matching", () => {
    const a = alert({ informedEntities: [{ routeId: "R099" }] });
    expect(matchSystemAlerts([a], NOW)).toHaveLength(0);
  });

  it("excludes an expired system-wide alert", () => {
    const a = alert({
      informedEntities: [{ agencyId: "TL" }],
      activePeriods: [{ start: new Date("2020-01-01T00:00:00Z"), end: new Date("2020-01-02T00:00:00Z") }],
    });
    expect(matchSystemAlerts([a], NOW)).toHaveLength(0);
  });
});
