import { describe, expect, it } from "vitest";
import { GtfsStaticStore } from "./store";
import type { GtfsStaticRawTables } from "./fetchGtfsStatic";

function fixture(overrides: Partial<GtfsStaticRawTables> = {}): GtfsStaticRawTables {
  return {
    routesText: "route_id,route_short_name,route_long_name,route_type\nR1,099,Commercial-Broadway,3\nR2,099,Commercial-Broadway B,3\n",
    tripsText: "trip_id,route_id,service_id,trip_headsign\nT1,R1,WEEKDAY,Downtown\nT2,R1,WEEKDAY,Uptown\n",
    stopsText: "stop_id,stop_name,stop_lat,stop_lon\nS1,Main St @ 1st Ave,49.28,-123.1\nS2,Main St @ 2nd Ave,49.29,-123.11\n",
    stopTimesText:
      "trip_id,stop_id,stop_sequence,arrival_time,departure_time\n" +
      "T1,S1,2,05:10:00,05:10:00\n" +
      "T1,S2,1,05:00:00,05:00:00\n" +
      "T2,S1,1,06:00:00,06:00:00\n",
    calendarText:
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n" +
      "WEEKDAY,1,1,1,1,1,0,0,20260101,20261231\n",
    calendarDatesText: "service_id,date,exception_type\n",
    fetchedAt: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  };
}

describe("GtfsStaticStore", () => {
  it("indexes routes by id and by short name (which may be shared across multiple routes)", () => {
    const store = new GtfsStaticStore(fixture());
    expect(store.routeById("R1")?.route_long_name).toBe("Commercial-Broadway");
    expect(store.findRoutesByShortName("099")).toHaveLength(2);
    expect(store.findRoutesByShortName("nonexistent")).toEqual([]);
  });

  it("indexes trips by id and by route", () => {
    const store = new GtfsStaticStore(fixture());
    expect(store.tripById("T1")?.trip_headsign).toBe("Downtown");
    expect(store.tripsForRoute("R1")).toHaveLength(2);
  });

  it("indexes stops by id", () => {
    const store = new GtfsStaticStore(fixture());
    expect(store.stopById("S1")?.stop_name).toBe("Main St @ 1st Ave");
  });

  it("combines calendar + calendar_dates for active service ids", () => {
    const store = new GtfsStaticStore(fixture());
    // 2026-09-24 is a Thursday, within WEEKDAY's range.
    expect(store.activeServiceIds("20260924").has("WEEKDAY")).toBe(true);
    // 2026-09-26 is a Saturday.
    expect(store.activeServiceIds("20260926").has("WEEKDAY")).toBe(false);
  });

  it("scans stop_times for requested trip ids only, sorted by stop_sequence", () => {
    const store = new GtfsStaticStore(fixture());
    const result = store.stopTimesForTrips(new Set(["T1"]));
    expect(result.size).toBe(1);
    const t1 = result.get("T1")!;
    expect(t1.map((s) => s.stop_id)).toEqual(["S2", "S1"]); // sequence 1 then 2
  });

  it("returns an empty map for an empty trip id set without scanning", () => {
    const store = new GtfsStaticStore(fixture());
    expect(store.stopTimesForTrips(new Set())).toEqual(new Map());
  });

  it("stopTimesForTrip returns an empty array for an unknown trip", () => {
    const store = new GtfsStaticStore(fixture());
    expect(store.stopTimesForTrip("NONEXISTENT")).toEqual([]);
  });

  it("exposes the raw feed's fetchedAt timestamp", () => {
    const store = new GtfsStaticStore(fixture());
    expect(store.fetchedAt).toEqual(new Date("2026-09-20T00:00:00Z"));
  });
});
