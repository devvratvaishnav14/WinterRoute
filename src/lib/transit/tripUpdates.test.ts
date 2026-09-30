import { describe, expect, it } from "vitest";
import { buildSegmentRealtime, indexTripUpdatesByTripId } from "./tripUpdates";
import type { TranslinkTripUpdate } from "./providers/translinkRealtime";
import type { GtfsStop } from "./gtfsStatic/types";

const ORIGIN: GtfsStop = { stop_id: "SA", stop_name: "A", stop_lat: "49.28", stop_lon: "-123.1" };
const DESTINATION: GtfsStop = { stop_id: "SB", stop_name: "B", stop_lat: "49.29", stop_lon: "-123.12" };

function tripUpdate(overrides: Partial<TranslinkTripUpdate> = {}): TranslinkTripUpdate {
  return {
    tripId: "T1",
    routeId: "R1",
    scheduleRelationship: "SCHEDULED",
    stopTimeUpdates: [],
    ...overrides,
  };
}

describe("indexTripUpdatesByTripId", () => {
  it("indexes entities by trip id", () => {
    const index = indexTripUpdatesByTripId([tripUpdate({ tripId: "T1" }), tripUpdate({ tripId: "T2" })]);
    expect(index.get("T1")?.tripId).toBe("T1");
    expect(index.get("T2")?.tripId).toBe("T2");
  });

  it("skips entities with no trip id", () => {
    const index = indexTripUpdatesByTripId([tripUpdate({ tripId: undefined })]);
    expect(index.size).toBe(0);
  });
});

describe("buildSegmentRealtime", () => {
  it("derives departure/arrival delay and time from the matching stop updates", () => {
    const update = tripUpdate({
      stopTimeUpdates: [
        { stopId: "SA", scheduleRelationship: "SCHEDULED", departureDelaySeconds: 90, departureTime: new Date("2026-09-24T15:01:30Z") },
        { stopId: "SB", scheduleRelationship: "SCHEDULED", arrivalDelaySeconds: 60, arrivalTime: new Date("2026-09-24T15:16:00Z") },
      ],
    });

    const result = buildSegmentRealtime(update, ORIGIN, DESTINATION);
    expect(result.tripStatus).toBe("scheduled");
    expect(result.departureDelaySeconds).toBe(90);
    expect(result.arrivalDelaySeconds).toBe(60);
    expect(result.realtimeDeparture).toEqual(new Date("2026-09-24T15:01:30Z"));
    expect(result.realtimeArrival).toEqual(new Date("2026-09-24T15:16:00Z"));
  });

  it("maps a CANCELED trip", () => {
    const update = tripUpdate({ scheduleRelationship: "CANCELED" });
    expect(buildSegmentRealtime(update, ORIGIN, DESTINATION).tripStatus).toBe("canceled");
  });

  it("maps a SKIPPED stop status for the destination stop", () => {
    const update = tripUpdate({
      stopTimeUpdates: [{ stopId: "SB", scheduleRelationship: "SKIPPED" }],
    });
    expect(buildSegmentRealtime(update, ORIGIN, DESTINATION).arrivalStopStatus).toBe("skipped");
  });

  it("leaves departure/arrival fields undefined when the trip update doesn't mention that stop at all", () => {
    const update = tripUpdate({ stopTimeUpdates: [] });
    const result = buildSegmentRealtime(update, ORIGIN, DESTINATION);
    expect(result.departureStopStatus).toBeUndefined();
    expect(result.departureDelaySeconds).toBeUndefined();
    expect(result.realtimeDeparture).toBeUndefined();
  });

  it("falls back to the arrival delay/time for a stop's departure fields when only arrival was published (e.g. the final stop)", () => {
    const update = tripUpdate({
      stopTimeUpdates: [{ stopId: "SA", scheduleRelationship: "SCHEDULED", arrivalDelaySeconds: 30, arrivalTime: new Date("2026-09-24T15:00:30Z") }],
    });
    const result = buildSegmentRealtime(update, ORIGIN, DESTINATION);
    expect(result.departureDelaySeconds).toBe(30);
    expect(result.realtimeDeparture).toEqual(new Date("2026-09-24T15:00:30Z"));
  });
});
