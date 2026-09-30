import { describe, expect, it } from "vitest";
import { route, segment, transitAnalysis, transitSegmentAnalysis } from "@/lib/scoring/fixtures";
import { analyzeTransitTimeline, buildTransitUncertaintyContributions } from "./transitTimeline";

const T = (hhmm: string) => new Date(`2026-09-24T${hhmm}:00.000Z`);

describe("analyzeTransitTimeline", () => {
  it("one bus, no transfer, no realtime: not disrupted, no observed delay", () => {
    const r = route([
      segment({ id: "w1", mode: "walk", durationMinutes: 5 }),
      segment({ id: "b1", mode: "bus", startTime: T("15:00"), endTime: T("15:16") }),
    ]);
    const transit = transitAnalysis({
      transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only", scheduledDeparture: T("15:00"), scheduledArrival: T("15:16") })],
    });
    const result = analyzeTransitTimeline(r, transit);
    expect(result.disrupted).toBe(false);
    expect(result.observedDelayMinutes).toBe(0);
  });

  it("bus -> rail transfer, both on schedule (no realtime): not disrupted", () => {
    const r = route([
      segment({ id: "b1", mode: "bus" }),
      segment({ id: "w1", mode: "walk", durationMinutes: 2 }),
      segment({ id: "r1", mode: "rail" }),
    ]);
    const transit = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only", scheduledDeparture: T("15:00"), scheduledArrival: T("15:16") }),
        transitSegmentAnalysis({ routeSegmentId: "r1", mode: "rail", status: "matched-schedule-only", scheduledDeparture: T("15:20"), scheduledArrival: T("15:24") }),
      ],
    });
    expect(analyzeTransitTimeline(r, transit).disrupted).toBe(false);
  });

  it("delayed first leg but transfer still possible: not disrupted, delay observed", () => {
    const r = route([
      segment({ id: "b1", mode: "bus" }),
      segment({ id: "w1", mode: "walk", durationMinutes: 2 }),
      segment({ id: "r1", mode: "rail" }),
    ]);
    const transit = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({
          routeSegmentId: "b1",
          status: "matched-with-realtime",
          scheduledDeparture: T("15:00"),
          scheduledArrival: T("15:16"),
          realtime: { tripStatus: "scheduled", realtimeArrival: T("15:18"), arrivalDelaySeconds: 120 },
        }),
        transitSegmentAnalysis({ routeSegmentId: "r1", mode: "rail", status: "matched-schedule-only", scheduledDeparture: T("15:24"), scheduledArrival: T("15:28") }),
      ],
    });
    const result = analyzeTransitTimeline(r, transit);
    expect(result.disrupted).toBe(false);
  });

  it("delayed first leg causes a missed transfer: disrupted, with an explanatory reason", () => {
    const r = route([
      segment({ id: "b1", mode: "bus", transitLine: { shortName: "145", longName: "", headsign: "", agencyName: "TransLink" } }),
      segment({ id: "w1", mode: "walk", durationMinutes: 2 }),
      segment({ id: "r1", mode: "rail" }),
    ]);
    const transit = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({
          routeSegmentId: "b1",
          status: "matched-with-realtime",
          scheduledDeparture: T("15:00"),
          scheduledArrival: T("15:20"),
          realtime: { tripStatus: "scheduled", realtimeArrival: T("15:26"), arrivalDelaySeconds: 360 },
        }),
        transitSegmentAnalysis({ routeSegmentId: "r1", mode: "rail", status: "matched-schedule-only", scheduledDeparture: T("15:24"), scheduledArrival: T("15:28") }),
      ],
    });
    const result = analyzeTransitTimeline(r, transit);
    expect(result.disrupted).toBe(true);
    expect(result.disruptionReasons[0]).toContain("145");
  });

  it("canceled first leg: disrupted", () => {
    const r = route([segment({ id: "b1", mode: "bus" }), segment({ id: "w1", mode: "walk", durationMinutes: 2 }), segment({ id: "r1", mode: "rail" })]);
    const transit = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "canceled" } }),
        transitSegmentAnalysis({ routeSegmentId: "r1", mode: "rail", status: "matched-schedule-only" }),
      ],
    });
    expect(analyzeTransitTimeline(r, transit).disrupted).toBe(true);
  });

  it("canceled second leg: disrupted, even if the first leg is fine", () => {
    const r = route([segment({ id: "b1", mode: "bus" }), segment({ id: "w1", mode: "walk", durationMinutes: 2 }), segment({ id: "r1", mode: "rail" })]);
    const transit = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", arrivalDelaySeconds: 0 } }),
        transitSegmentAnalysis({ routeSegmentId: "r1", mode: "rail", status: "matched-with-realtime", realtime: { tripStatus: "canceled" } }),
      ],
    });
    expect(analyzeTransitTimeline(r, transit).disrupted).toBe(true);
  });

  it("future trip with schedule only (no realtime): not disrupted — missing realtime is normal, not evidence of a problem", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transit = transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only" })] });
    const result = analyzeTransitTimeline(r, transit);
    expect(result.disrupted).toBe(false);
    expect(result.observedDelayMinutes).toBe(0);
  });

  it("extracts the final leg's realtime arrival delay as the observed delay", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transit = transitAnalysis({
      transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", arrivalDelaySeconds: 300 } })],
    });
    expect(analyzeTransitTimeline(r, transit).observedDelayMinutes).toBe(5);
  });

  it("does not check for a missed connection when the earlier leg has no realtime evidence at all", () => {
    // Even if the schedule LOOKS tight, without realtime evidence there's nothing to contradict the plan with.
    const r = route([segment({ id: "b1", mode: "bus" }), segment({ id: "r1", mode: "rail" })]);
    const transit = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only", scheduledDeparture: T("15:00"), scheduledArrival: T("15:20") }),
        transitSegmentAnalysis({ routeSegmentId: "r1", mode: "rail", status: "matched-schedule-only", scheduledDeparture: T("15:20"), scheduledArrival: T("15:24") }),
      ],
    });
    expect(analyzeTransitTimeline(r, transit).disrupted).toBe(false);
  });
});

describe("buildTransitUncertaintyContributions", () => {
  it("widens uncertainty for a schedule-only segment", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transit = transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only" })] });
    const contributions = buildTransitUncertaintyContributions(r, transit);
    expect(contributions.some((c) => c.key.startsWith("transitScheduleOnly"))).toBe(true);
  });

  it("does not widen uncertainty for a realtime-confirmed segment with no alert", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transit = transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled" } })] });
    const contributions = buildTransitUncertaintyContributions(r, transit);
    expect(contributions.some((c) => c.key.startsWith("transitScheduleOnly"))).toBe(false);
  });

  it("adds a widening contribution for a segment-level alert", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transit = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({
          routeSegmentId: "b1",
          status: "matched-schedule-only",
          relevantAlerts: [{ provider: "translink", id: "a1", cause: "unknown", effect: "significantDelays", headerText: "", descriptionText: "", activePeriods: [], matchedOn: "route" }],
        }),
      ],
    });
    const contributions = buildTransitUncertaintyContributions(r, transit);
    expect(contributions.some((c) => c.key.startsWith("transitAlert"))).toBe(true);
  });

  it("adds a widening contribution for a system-wide alert", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transit = transitAnalysis({
      transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only" })],
      systemAlerts: [{ provider: "translink", id: "sys1", cause: "unknown", effect: "noService", headerText: "", descriptionText: "", activePeriods: [], matchedOn: "agency" }],
    });
    const contributions = buildTransitUncertaintyContributions(r, transit);
    expect(contributions.some((c) => c.key.startsWith("transitSystemAlert"))).toBe(true);
  });

  it("returns nothing for an unmatched segment", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transit = transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "unmatched", match: { quality: "unmatched", evidence: [] } })] });
    expect(buildTransitUncertaintyContributions(r, transit)).toEqual([]);
  });
});
