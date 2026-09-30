import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route, RouteSegment } from "@/lib/route/types";
import { GtfsStaticStore } from "./gtfsStatic/store";
import type { GtfsStaticRawTables } from "./gtfsStatic/fetchGtfsStatic";
import type { TranslinkAlert, TranslinkFeed, TranslinkTripUpdate, TranslinkVehiclePosition } from "./providers/translinkRealtime";
import { analyzeRouteTransit } from "./analyzeRouteTransit";

const { getGtfsStaticStore, getTripUpdatesFeed, getVehiclePositionsFeed, getServiceAlertsFeed } = vi.hoisted(() => ({
  getGtfsStaticStore: vi.fn(),
  getTripUpdatesFeed: vi.fn(),
  getVehiclePositionsFeed: vi.fn(),
  getServiceAlertsFeed: vi.fn(),
}));

vi.mock("./gtfsStatic/getGtfsStaticStore", () => ({ getGtfsStaticStore }));
vi.mock("./getRealtimeFeeds", () => ({ getTripUpdatesFeed, getVehiclePositionsFeed, getServiceAlertsFeed }));

const STOP_A = { latitude: 49.28, longitude: -123.1 };
const STOP_B = { latitude: 49.29, longitude: -123.12 };

function staticFixture(overrides: Partial<GtfsStaticRawTables> = {}): GtfsStaticStore {
  const raw: GtfsStaticRawTables = {
    routesText: "route_id,route_short_name,route_long_name,route_type\nR099,099,Commercial-Broadway\n",
    tripsText: "trip_id,route_id,service_id,trip_headsign\nT-0800,R099,WEEKDAY,Downtown\n",
    stopsText: `stop_id,stop_name,stop_lat,stop_lon\nSA,Main St @ 1st,${STOP_A.latitude},${STOP_A.longitude}\nSB,Main St @ 5th,${STOP_B.latitude},${STOP_B.longitude}\n`,
    stopTimesText:
      "trip_id,stop_id,stop_sequence,arrival_time,departure_time\nT-0800,SA,1,08:00:00,08:00:00\nT-0800,SB,2,08:15:00,08:15:00\n",
    calendarText:
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWEEKDAY,1,1,1,1,1,0,0,20260101,20261231\n",
    calendarDatesText: "service_id,date,exception_type\n",
    fetchedAt: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  };
  return new GtfsStaticStore(raw);
}

function busSegment(overrides: Partial<RouteSegment> = {}): RouteSegment {
  return {
    id: "seg-1",
    mode: "bus",
    start: { label: "Main St @ 1st", ...STOP_A },
    end: { label: "Main St @ 5th", ...STOP_B },
    startTime: new Date("2026-09-24T15:00:00Z"), // 08:00 PDT, Thursday
    endTime: new Date("2026-09-24T15:15:00Z"),
    transitLine: { shortName: "099", longName: "Commercial-Broadway", headsign: "Downtown", agencyName: "TransLink" },
    ...overrides,
  };
}

function routeWithSegments(segments: RouteSegment[]): Route {
  return {
    origin: { label: "Origin", latitude: 49.2, longitude: -123.0 },
    destination: { label: "Destination", latitude: 49.3, longitude: -123.2 },
    segments,
  };
}

function emptyFeed<T>(): TranslinkFeed<T> {
  return { entities: [], headerTimestamp: new Date("2026-09-24T14:55:00Z") };
}

const TRIP_TIME = new Date("2026-09-24T15:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  getGtfsStaticStore.mockResolvedValue(staticFixture());
  getTripUpdatesFeed.mockResolvedValue(emptyFeed<TranslinkTripUpdate>());
  getVehiclePositionsFeed.mockResolvedValue(emptyFeed<TranslinkVehiclePosition>());
  getServiceAlertsFeed.mockResolvedValue(emptyFeed<TranslinkAlert>());
});

describe("analyzeRouteTransit", () => {
  it("returns not-applicable and calls no TransLink feed for a car trip", async () => {
    const route = routeWithSegments([{ ...busSegment(), mode: "drive" }]);
    const result = await analyzeRouteTransit({ route, mode: "car", tripDateTime: TRIP_TIME });

    expect(result.status).toBe("not-applicable");
    expect(getGtfsStaticStore).not.toHaveBeenCalled();
    expect(getTripUpdatesFeed).not.toHaveBeenCalled();
    expect(getVehiclePositionsFeed).not.toHaveBeenCalled();
    expect(getServiceAlertsFeed).not.toHaveBeenCalled();
  });

  it("returns not-applicable and calls no TransLink feed for a walk trip", async () => {
    const route = routeWithSegments([{ ...busSegment(), mode: "walk" }]);
    const result = await analyzeRouteTransit({ route, mode: "walk", tripDateTime: TRIP_TIME });
    expect(result.status).toBe("not-applicable");
    expect(getGtfsStaticStore).not.toHaveBeenCalled();
  });

  it("returns not-applicable when a transit-mode request's route has no bus/rail segments", async () => {
    const route = routeWithSegments([{ ...busSegment(), mode: "walk" }]);
    const result = await analyzeRouteTransit({ route, mode: "bus", tripDateTime: TRIP_TIME });
    expect(result.status).toBe("not-applicable");
    expect(getGtfsStaticStore).not.toHaveBeenCalled();
  });

  it("analyzes whatever transit segments the real route has, even if the user requested a different single mode", async () => {
    const route = routeWithSegments([busSegment()]);
    const result = await analyzeRouteTransit({ route, mode: "bus", tripDateTime: TRIP_TIME });
    expect(result.status).toBe("analyzed");
    expect(result.transitSegments).toHaveLength(1);
  });

  it("returns 'matched-schedule-only' with no fabricated delay when no realtime update exists for the matched trip", async () => {
    const route = routeWithSegments([busSegment()]);
    const result = await analyzeRouteTransit({ route, mode: "bus", tripDateTime: TRIP_TIME });

    expect(result.status).toBe("analyzed");
    const segment = result.transitSegments[0];
    expect(segment.status).toBe("matched-schedule-only");
    expect(segment.recency).toBe("future");
    expect(segment.realtime).toBeUndefined();
    expect(segment.scheduledDeparture).toEqual(new Date("2026-09-24T15:00:00Z"));
  });

  it("returns 'matched-with-realtime' with delay data when TransLink has published a trip update for the matched trip", async () => {
    getTripUpdatesFeed.mockResolvedValue({
      entities: [
        {
          tripId: "T-0800",
          routeId: "R099",
          scheduleRelationship: "SCHEDULED",
          stopTimeUpdates: [
            { stopId: "SA", scheduleRelationship: "SCHEDULED", departureDelaySeconds: 120 },
            { stopId: "SB", scheduleRelationship: "SCHEDULED", arrivalDelaySeconds: 90 },
          ],
        },
      ],
      headerTimestamp: new Date("2026-09-24T14:59:00Z"),
    });

    const route = routeWithSegments([busSegment()]);
    const result = await analyzeRouteTransit({ route, mode: "bus", tripDateTime: TRIP_TIME });

    const segment = result.transitSegments[0];
    expect(segment.status).toBe("matched-with-realtime");
    expect(segment.recency).toBe("near-term");
    expect(segment.realtime?.departureDelaySeconds).toBe(120);
    expect(segment.realtime?.arrivalDelaySeconds).toBe(90);
  });

  it("attaches a fresh vehicle observation only for a near-term (realtime-confirmed) segment", async () => {
    getTripUpdatesFeed.mockResolvedValue({
      entities: [{ tripId: "T-0800", routeId: "R099", scheduleRelationship: "SCHEDULED", stopTimeUpdates: [] }],
      headerTimestamp: new Date(),
    });
    getVehiclePositionsFeed.mockResolvedValue({
      entities: [{ tripId: "T-0800", routeId: "R099", vehicleId: "V1", latitude: 49.281, longitude: -123.101, observedAt: new Date() }],
      headerTimestamp: new Date(),
    });

    const route = routeWithSegments([busSegment()]);
    const result = await analyzeRouteTransit({ route, mode: "bus", tripDateTime: TRIP_TIME });
    expect(result.transitSegments[0].realtime?.vehicle?.providerVehicleId).toBe("V1");
  });

  it("marks the analysis 'unavailable' (not silently 'unmatched') when GTFS static itself fails to load", async () => {
    getGtfsStaticStore.mockRejectedValue(new Error("network error"));
    const route = routeWithSegments([busSegment()]);
    const result = await analyzeRouteTransit({ route, mode: "bus", tripDateTime: TRIP_TIME });
    expect(result.status).toBe("unavailable");
    expect(result.sourceStatus.gtfsStatic).toBe("unavailable");
  });

  it("degrades gracefully when only the trip updates feed fails, still analyzing on schedule alone", async () => {
    getTripUpdatesFeed.mockRejectedValue(new Error("network error"));
    const route = routeWithSegments([busSegment()]);
    const result = await analyzeRouteTransit({ route, mode: "bus", tripDateTime: TRIP_TIME });

    expect(result.status).toBe("analyzed");
    expect(result.sourceStatus.tripUpdates).toBe("unavailable");
    expect(result.transitSegments[0].status).toBe("matched-schedule-only");
  });

  it("returns 'unmatched' for a transit segment with no corresponding GTFS route, rather than throwing", async () => {
    const route = routeWithSegments([
      { ...busSegment(), transitLine: { shortName: "999", longName: "", headsign: "", agencyName: "TransLink" } },
    ]);
    const result = await analyzeRouteTransit({ route, mode: "bus", tripDateTime: TRIP_TIME });
    expect(result.transitSegments[0].status).toBe("unmatched");
    expect(result.transitSegments[0].match.quality).toBe("unmatched");
  });

  it("places a system-wide alert in systemAlerts, not attached to any individual segment", async () => {
    getServiceAlertsFeed.mockResolvedValue({
      entities: [
        {
          id: "SYS-1",
          cause: "WEATHER",
          effect: "SIGNIFICANT_DELAYS",
          headerText: "System-wide delays",
          descriptionText: "Details",
          activePeriods: [],
          informedEntities: [{ agencyId: "TL" }],
        },
      ],
      headerTimestamp: new Date(),
    });

    const route = routeWithSegments([busSegment()]);
    const result = await analyzeRouteTransit({ route, mode: "bus", tripDateTime: TRIP_TIME });
    expect(result.systemAlerts).toHaveLength(1);
    expect(result.transitSegments[0].relevantAlerts).toHaveLength(0);
  });
});
