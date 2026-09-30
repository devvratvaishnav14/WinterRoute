import { describe, expect, it } from "vitest";
import type { RouteSegment } from "@/lib/route/types";
import { matchSegmentToGtfs } from "./matching";
import { GtfsStaticStore } from "./gtfsStatic/store";
import type { GtfsStaticRawTables } from "./gtfsStatic/fetchGtfsStatic";

const STOP_A = { latitude: 49.28, longitude: -123.1 };
const STOP_B = { latitude: 49.29, longitude: -123.12 };
const FAR_AWAY = { latitude: 49.5, longitude: -122.5 };

function fixture(overrides: Partial<GtfsStaticRawTables> = {}): GtfsStaticRawTables {
  return {
    routesText: "route_id,route_short_name,route_long_name,route_type\nR099,099,Commercial-Broadway\n",
    tripsText:
      "trip_id,route_id,service_id,trip_headsign\n" +
      "T-0800,R099,WEEKDAY,Downtown\n" +
      "T-0805,R099,WEEKDAY,Downtown\n",
    stopsText: `stop_id,stop_name,stop_lat,stop_lon\nSA,Main St @ 1st,${STOP_A.latitude},${STOP_A.longitude}\nSB,Main St @ 5th,${STOP_B.latitude},${STOP_B.longitude}\n`,
    stopTimesText:
      "trip_id,stop_id,stop_sequence,arrival_time,departure_time\n" +
      "T-0800,SA,1,08:00:00,08:00:00\n" +
      "T-0800,SB,2,08:15:00,08:15:00\n" +
      "T-0805,SA,1,08:05:00,08:05:00\n" +
      "T-0805,SB,2,08:20:00,08:20:00\n",
    calendarText:
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n" +
      "WEEKDAY,1,1,1,1,1,0,0,20260101,20261231\n",
    calendarDatesText: "service_id,date,exception_type\n",
    fetchedAt: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  };
}

// 2026-09-24 is a Thursday (WEEKDAY service active). Times are Vancouver
// local (PDT, UTC-7) — 08:00 local == 15:00 UTC.
function segment(overrides: Partial<RouteSegment> = {}): RouteSegment {
  return {
    id: "seg-1",
    mode: "bus",
    start: { label: "Main St @ 1st", ...STOP_A },
    end: { label: "Main St @ 5th", ...STOP_B },
    startTime: new Date("2026-09-24T15:00:00Z"), // 08:00 PDT
    transitLine: { shortName: "099", longName: "Commercial-Broadway", headsign: "Downtown", agencyName: "TransLink" },
    ...overrides,
  };
}

describe("matchSegmentToGtfs", () => {
  it("falls back to matching by route_long_name when the segment has no short name (real SkyTrain routes have none)", () => {
    const store = new GtfsStaticStore(
      fixture({
        routesText: "route_id,route_short_name,route_long_name,route_type\nR-EXPO,,Expo Line,1\n",
        tripsText: "trip_id,route_id,service_id,trip_headsign\nT-0800,R-EXPO,WEEKDAY,Waterfront\n",
      }),
    );
    const result = matchSegmentToGtfs(
      segment({
        mode: "rail",
        transitLine: { shortName: "", longName: "Expo Line", headsign: "Waterfront", agencyName: "TransLink" },
      }),
      store,
    );
    expect(result.routeMatch.quality).toBe("exact");
    expect(result.routeMatch.routeId).toBe("R-EXPO");
  });

  it("returns 'unmatched' immediately for a non-bus/rail segment mode", () => {
    const store = new GtfsStaticStore(fixture());
    const result = matchSegmentToGtfs(segment({ mode: "walk" }), store);
    expect(result.routeMatch.quality).toBe("unmatched");
  });

  it("returns 'unmatched' when there's no transit line short name to match", () => {
    const store = new GtfsStaticStore(fixture());
    const result = matchSegmentToGtfs(segment({ transitLine: undefined }), store);
    expect(result.routeMatch.quality).toBe("unmatched");
  });

  it("returns an exact match when route, stops, and time all line up tightly", () => {
    const store = new GtfsStaticStore(fixture());
    // Only T-0800 is close in time (08:00 local); T-0805 is 5 min off, outside the ambiguity margin.
    const result = matchSegmentToGtfs(segment({ startTime: new Date("2026-09-24T15:00:00Z") }), store);
    expect(result.routeMatch.quality).toBe("exact");
    expect(result.routeMatch.tripId).toBe("T-0800");
    expect(result.routeMatch.routeId).toBe("R099");
    expect(result.routeMatch.serviceId).toBe("WEEKDAY");
    expect(result.resolved?.originStop.stop_id).toBe("SA");
    expect(result.resolved?.destinationStop.stop_id).toBe("SB");
    expect(result.resolved?.scheduledDeparture).toEqual(new Date("2026-09-24T15:00:00Z"));
    expect(result.resolved?.scheduledArrival).toEqual(new Date("2026-09-24T15:15:00Z"));
  });

  it("does not populate 'resolved' for an unmatched or ambiguous result", () => {
    const store = new GtfsStaticStore(fixture());
    const unmatchedResult = matchSegmentToGtfs(segment({ mode: "walk" }), store);
    expect(unmatchedResult.resolved).toBeUndefined();

    const ambiguousResult = matchSegmentToGtfs(segment({ startTime: new Date("2026-09-24T15:02:30Z") }), store);
    expect(ambiguousResult.resolved).toBeUndefined();
  });

  it("returns 'unmatched' for the wrong route short name", () => {
    const store = new GtfsStaticStore(fixture());
    const result = matchSegmentToGtfs(
      segment({ transitLine: { shortName: "999", longName: "", headsign: "", agencyName: "TransLink" } }),
      store,
    );
    expect(result.routeMatch.quality).toBe("unmatched");
  });

  it("returns 'unmatched' when the segment's stops don't correspond to any stop on the route", () => {
    const store = new GtfsStaticStore(fixture());
    const result = matchSegmentToGtfs(
      segment({ start: { label: "Nowhere", ...FAR_AWAY }, end: { label: "Also nowhere", ...FAR_AWAY } }),
      store,
    );
    expect(result.routeMatch.quality).toBe("unmatched");
  });

  it("returns 'unmatched' when the only time-close trip is outside the tolerance window", () => {
    const store = new GtfsStaticStore(fixture());
    // 09:30 local is 90 minutes from both scheduled trips — outside the 12-minute tolerance.
    const result = matchSegmentToGtfs(segment({ startTime: new Date("2026-09-24T16:30:00Z") }), store);
    expect(result.routeMatch.quality).toBe("unmatched");
  });

  it("returns 'ambiguous' when two candidate trips are equally plausible, and never guesses one", () => {
    const store = new GtfsStaticStore(fixture());
    // Exactly between 08:00 and 08:05 — both trips are within tolerance and within the ambiguity margin of each other.
    const result = matchSegmentToGtfs(segment({ startTime: new Date("2026-09-24T15:02:30Z") }), store);
    expect(result.routeMatch.quality).toBe("ambiguous");
    expect(result.routeMatch.tripId).toBeUndefined();
    expect(result.routeMatch.ambiguousCandidateTripIds).toEqual(expect.arrayContaining(["T-0800", "T-0805"]));
  });

  it("rejects a candidate trip whose stop_sequence has the segment's start after its end (wrong direction)", () => {
    const store = new GtfsStaticStore(
      fixture({
        stopTimesText:
          "trip_id,stop_id,stop_sequence,arrival_time,departure_time\n" +
          "T-0800,SB,1,08:00:00,08:00:00\n" +
          "T-0800,SA,2,08:15:00,08:15:00\n" +
          "T-0805,SA,1,08:05:00,08:05:00\n" +
          "T-0805,SB,2,08:20:00,08:20:00\n",
      }),
    );
    // segment() goes SA -> SB; only T-0800 now runs SB -> SA (wrong direction), so only T-0805 remains, alone (exact/high-confidence, not ambiguous).
    const result = matchSegmentToGtfs(segment({ startTime: new Date("2026-09-24T15:05:00Z") }), store);
    expect(result.routeMatch.quality).not.toBe("ambiguous");
    expect(result.routeMatch.tripId).toBe("T-0805");
  });

  it("matches a trip encoded under the prior service day's >24:00 time for a late-night segment", () => {
    const store = new GtfsStaticStore(
      fixture({
        tripsText: "trip_id,route_id,service_id,trip_headsign\nT-LATE,R099,WEEKDAY,Downtown\n",
        stopTimesText:
          "trip_id,stop_id,stop_sequence,arrival_time,departure_time\n" +
          "T-LATE,SA,1,25:10:00,25:10:00\n" + // 1:10 AM next day, encoded under 2026-09-24's service.
          "T-LATE,SB,2,25:25:00,25:25:00\n",
      }),
    );
    // 2026-09-25 01:10 AM PDT == 2026-09-25T08:10:00Z. The trip's own
    // service date is 2026-09-24 (the day before), reachable via
    // previousServiceDate from the segment's actual calendar date.
    const result = matchSegmentToGtfs(segment({ startTime: new Date("2026-09-25T08:10:00Z") }), store);
    expect(result.routeMatch.quality).toBe("exact");
    expect(result.routeMatch.tripId).toBe("T-LATE");
    expect(result.routeMatch.serviceId).toBe("WEEKDAY");
  });
});
