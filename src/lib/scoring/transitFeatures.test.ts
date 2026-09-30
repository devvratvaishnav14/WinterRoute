import { describe, expect, it } from "vitest";
import { buildRouteTransitFeatures, buildSegmentTransitFeatures } from "./transitFeatures";
import { segment, transitAnalysis, transitSegmentAnalysis } from "./fixtures";

describe("buildSegmentTransitFeatures", () => {
  it("is 'not-applicable' for a non-transit segment", () => {
    const result = buildSegmentTransitFeatures(segment({ mode: "walk" }), transitAnalysis());
    expect(result.availability).toBe("not-applicable");
  });

  it("is 'unavailable' when the whole transit analysis failed", () => {
    const result = buildSegmentTransitFeatures(
      segment({ id: "seg-1", mode: "bus" }),
      transitAnalysis({ status: "unavailable", reason: "GTFS static unavailable" }),
    );
    expect(result.availability).toBe("unavailable");
  });

  it("is 'unavailable' for a segment that couldn't be matched, but preserves the match quality for the dev-detail view", () => {
    const analysis = transitAnalysis({
      transitSegments: [transitSegmentAnalysis({ routeSegmentId: "seg-1", status: "unmatched", match: { quality: "ambiguous", evidence: [] } })],
    });
    const result = buildSegmentTransitFeatures(segment({ id: "seg-1", mode: "bus" }), analysis);
    expect(result.availability).toBe("unavailable");
    expect(result.matchQuality).toBe("ambiguous");
  });

  it("is 'available' with no delay data for a schedule-only match ('no update ≠ 0 delay')", () => {
    const analysis = transitAnalysis({
      transitSegments: [transitSegmentAnalysis({ routeSegmentId: "seg-1", status: "matched-schedule-only" })],
    });
    const result = buildSegmentTransitFeatures(segment({ id: "seg-1", mode: "bus" }), analysis);
    expect(result.availability).toBe("available");
    expect(result.departureDelaySeconds).toBeUndefined();
    expect(result.isCanceled).toBe(false);
  });

  it("extracts delay/cancellation/skip from a realtime-matched segment", () => {
    const analysis = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({
          routeSegmentId: "seg-1",
          status: "matched-with-realtime",
          realtime: {
            tripStatus: "canceled",
            departureStopStatus: "skipped",
            departureDelaySeconds: 120,
            arrivalDelaySeconds: 90,
          },
        }),
      ],
    });
    const result = buildSegmentTransitFeatures(segment({ id: "seg-1", mode: "bus" }), analysis);
    expect(result.isCanceled).toBe(true);
    expect(result.hasSkippedStop).toBe(true);
    expect(result.departureDelaySeconds).toBe(120);
  });
});

describe("buildRouteTransitFeatures", () => {
  it("returns 'not-applicable' when the trip has no transit segments", () => {
    const result = buildRouteTransitFeatures(transitAnalysis({ status: "not-applicable", reason: "no transit segments" }));
    expect(result.availability).toBe("not-applicable");
  });

  it("returns 'unavailable' when the fetch failed entirely (null) or the analysis itself failed", () => {
    expect(buildRouteTransitFeatures(null).availability).toBe("unavailable");
    expect(buildRouteTransitFeatures(transitAnalysis({ status: "unavailable" })).availability).toBe("unavailable");
  });

  it("computes median/mean delay only across realtime-matched segments, never including schedule-only ones", () => {
    const analysis = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds: 60 } }),
        transitSegmentAnalysis({ routeSegmentId: "s2", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds: 120 } }),
        transitSegmentAnalysis({ routeSegmentId: "s3", status: "matched-schedule-only" }),
      ],
    });
    const result = buildRouteTransitFeatures(analysis);
    expect(result.realtimeMatchedSegmentCount).toBe(2);
    expect(result.scheduleOnlySegmentCount).toBe(1);
    expect(result.meanDelaySecondsAcrossRealtimeSegments).toBe(90);
    expect(result.medianDelaySecondsAcrossRealtimeSegments).toBe(90);
  });

  it("counts canceled and skipped-stop segments", () => {
    const analysis = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "canceled" } }),
        transitSegmentAnalysis({ routeSegmentId: "s2", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", arrivalStopStatus: "skipped" } }),
      ],
    });
    const result = buildRouteTransitFeatures(analysis);
    expect(result.canceledSegmentCount).toBe(1);
    expect(result.skippedStopSegmentCount).toBe(1);
  });

  it("collects distinct alert effects across segment and system alerts", () => {
    const analysis = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({
          routeSegmentId: "s1",
          relevantAlerts: [{ provider: "translink", id: "a1", cause: "unknown", effect: "significantDelays", headerText: "", descriptionText: "", activePeriods: [], matchedOn: "route" }],
        }),
      ],
      systemAlerts: [{ provider: "translink", id: "a2", cause: "unknown", effect: "noService", headerText: "", descriptionText: "", activePeriods: [], matchedOn: "agency" }],
    });
    const result = buildRouteTransitFeatures(analysis);
    expect(result.relevantAlertEffects).toEqual(expect.arrayContaining(["significantDelays", "noService"]));
  });

  it("computes transferCount as one less than the number of transit segments", () => {
    const analysis = transitAnalysis({
      transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1" }), transitSegmentAnalysis({ routeSegmentId: "s2" })],
    });
    expect(buildRouteTransitFeatures(analysis).transferCount).toBe(1);
  });

  it("classifies availability as 'not-yet-available' when every matched segment is schedule-only", () => {
    const analysis = transitAnalysis({
      transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-schedule-only" })],
    });
    expect(buildRouteTransitFeatures(analysis).availability).toBe("not-yet-available");
  });
});
