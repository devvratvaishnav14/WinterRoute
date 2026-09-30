import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Route } from "@/lib/route/types";
import type { GoogleTrafficAwareResult } from "@/lib/google/trafficRoutes";
import * as googleTraffic from "@/lib/google/trafficRoutes";
import * as driveBcProvider from "./providers/driveBC";
import type { Open511Event } from "./providers/driveBC";
import { analyzeRouteTraffic } from "./analyzeRouteTraffic";
import { clearRequestCache } from "@/lib/cache/requestCache";

function loc(label: string, latitude: number, longitude: number) {
  return { label, latitude, longitude };
}

function driveRoute(): Route {
  return {
    origin: loc("SFU Burnaby", 49.2781, -122.9199),
    destination: loc("Downtown Vancouver", 49.2827, -123.1207),
    baselineDurationMinutes: 29,
    totalDistanceMeters: 18000,
    segments: [
      {
        id: "drive-1",
        mode: "drive",
        start: loc("SFU Burnaby", 49.2781, -122.9199),
        end: loc("Downtown Vancouver", 49.2827, -123.1207),
        durationMinutes: 29,
        distanceMeters: 18000,
        geometry: [
          { latitude: 49.2781, longitude: -122.9199 },
          { latitude: 49.2827, longitude: -123.1207 },
        ],
      },
    ],
  };
}

function transitRoute(): Route {
  return {
    origin: loc("SFU Burnaby", 49.2781, -122.9199),
    destination: loc("Downtown Vancouver", 49.2827, -123.1207),
    baselineDurationMinutes: 55,
    segments: [
      {
        id: "walk-1",
        mode: "walk",
        start: loc("SFU Burnaby", 49.2781, -122.9199),
        end: loc("Stop", 49.28, -122.92),
        durationMinutes: 5,
        geometry: [
          { latitude: 49.2781, longitude: -122.9199 },
          { latitude: 49.28, longitude: -122.92 },
        ],
      },
      {
        id: "bus-1",
        mode: "bus",
        start: loc("Stop", 49.28, -122.92),
        end: loc("Downtown Vancouver", 49.2827, -123.1207),
        durationMinutes: 50,
        geometry: [
          { latitude: 49.28, longitude: -122.92 },
          { latitude: 49.2827, longitude: -123.1207 },
        ],
      },
    ],
  };
}

function trafficFixture(): GoogleTrafficAwareResult {
  return {
    durationSeconds: 2160,
    staticDurationSeconds: 1740,
    distanceMeters: 18000,
    speedIntervals: [],
    polyline: [
      { latitude: 49.2781, longitude: -122.9199 },
      { latitude: 49.2827, longitude: -123.1207 },
    ],
  };
}

function eventFixture(): Open511Event {
  return {
    id: "drivebc.ca/TEST-1",
    headline: "Lane closure",
    status: "ACTIVE",
    created: "2026-09-24T10:00:00-07:00",
    updated: "2026-09-24T10:00:00-07:00",
    description: "Lane closure on Hwy 1",
    event_type: "INCIDENT",
    severity: "MAJOR",
    // Matches a route geometry point exactly, guaranteeing it's within the proximity threshold.
    geography: { type: "Point", coordinates: [-122.9199, 49.2781] },
    roads: [{ name: "Highway 1", direction: "BOTH" }],
  };
}

// Always comfortably in the future relative to whenever this test actually
// runs, rather than a fixed date that would eventually become the past.
const TRIP_DATE_TIME = new Date(Date.now() + 24 * 60 * 60 * 1000);

beforeEach(() => {
  clearRequestCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearRequestCache();
});

describe("analyzeRouteTraffic", () => {
  it("analyzes traffic for a car trip and returns relevant road events", async () => {
    vi.spyOn(googleTraffic, "fetchTrafficAwareRoute").mockResolvedValue(trafficFixture());
    vi.spyOn(driveBcProvider, "fetchDriveBcEvents").mockResolvedValue([eventFixture()]);

    const result = await analyzeRouteTraffic({
      route: driveRoute(),
      mode: "car",
      timePreference: "leaveAt",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(result.trafficAnalysis.status).toBe("analyzed");
    if (result.trafficAnalysis.status === "analyzed") {
      expect(result.trafficAnalysis.analysis.trafficAwareDurationMinutes).toBe(36);
      expect(result.trafficAnalysis.analysis.referenceBaselineDurationMinutes).toBe(29);
    }
    expect(result.roadEventStatus).toBe("ok");
    expect(result.roadEvents).toHaveLength(1);
  });

  it.each(["bus", "train", "walk", "cycle"] as const)(
    "reports traffic analysis as not-applicable for %s, but still checks road events",
    async (mode) => {
      vi.spyOn(googleTraffic, "fetchTrafficAwareRoute").mockResolvedValue(trafficFixture());
      vi.spyOn(driveBcProvider, "fetchDriveBcEvents").mockResolvedValue([eventFixture()]);

      const result = await analyzeRouteTraffic({
        route: mode === "bus" ? transitRoute() : driveRoute(),
        mode,
        timePreference: "leaveAt",
        tripDateTime: TRIP_DATE_TIME,
      });

      expect(result.trafficAnalysis.status).toBe("not-applicable");
      expect(googleTraffic.fetchTrafficAwareRoute).not.toHaveBeenCalled();
      // Road events are still checked regardless of mode.
      expect(result.roadEventStatus).toBe("ok");
    },
  );

  it("reports traffic as unavailable when the Google call fails, without blocking road events", async () => {
    vi.spyOn(googleTraffic, "fetchTrafficAwareRoute").mockRejectedValue(
      new googleTraffic.GoogleTrafficRequestError("down", 500),
    );
    vi.spyOn(driveBcProvider, "fetchDriveBcEvents").mockResolvedValue([eventFixture()]);

    const result = await analyzeRouteTraffic({
      route: driveRoute(),
      mode: "car",
      timePreference: "leaveAt",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(result.trafficAnalysis.status).toBe("unavailable");
    expect(result.roadEventStatus).toBe("ok");
    expect(result.roadEvents).toHaveLength(1);
  });

  it("reports roadEventStatus as unavailable (not 'no events') when DriveBC fails, without blocking traffic analysis", async () => {
    vi.spyOn(googleTraffic, "fetchTrafficAwareRoute").mockResolvedValue(trafficFixture());
    vi.spyOn(driveBcProvider, "fetchDriveBcEvents").mockRejectedValue(new Error("network down"));

    const result = await analyzeRouteTraffic({
      route: driveRoute(),
      mode: "car",
      timePreference: "leaveAt",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(result.trafficAnalysis.status).toBe("analyzed");
    expect(result.roadEventStatus).toBe("unavailable");
    expect(result.roadEvents).toEqual([]);
  });

  it("reports both sources as unavailable when everything fails", async () => {
    vi.spyOn(googleTraffic, "fetchTrafficAwareRoute").mockRejectedValue(
      new googleTraffic.GoogleTrafficRequestError("down", 500),
    );
    vi.spyOn(driveBcProvider, "fetchDriveBcEvents").mockRejectedValue(new Error("down"));

    const result = await analyzeRouteTraffic({
      route: driveRoute(),
      mode: "car",
      timePreference: "leaveAt",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(result.trafficAnalysis.status).toBe("unavailable");
    expect(result.roadEventStatus).toBe("unavailable");
  });

  it("accepts a Leave At time equal to 'now' even once seconds have elapsed since the request started", async () => {
    // Regression test: a minute-precision selected time (seconds always
    // :00) must not be misread as "already passed" just because a few
    // real seconds ticked by before this ran — see the flooring comment
    // in analyzeRouteTraffic.ts.
    vi.spyOn(googleTraffic, "fetchTrafficAwareRoute").mockResolvedValue(trafficFixture());
    vi.spyOn(driveBcProvider, "fetchDriveBcEvents").mockResolvedValue([]);

    const now = new Date();
    const startOfCurrentMinute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);

    const result = await analyzeRouteTraffic({
      route: driveRoute(),
      mode: "car",
      timePreference: "leaveAt",
      tripDateTime: startOfCurrentMinute,
    });

    expect(result.trafficAnalysis.status).toBe("analyzed");
  });

  it("reports 'unavailable' (not a failed Google call) when a nominal Arrive By departure would already be in the past", async () => {
    const fetchSpy = vi.spyOn(googleTraffic, "fetchTrafficAwareRoute").mockResolvedValue(trafficFixture());
    vi.spyOn(driveBcProvider, "fetchDriveBcEvents").mockResolvedValue([]);

    // Arrival only 5 minutes from now, but the route takes 29 minutes —
    // the nominal departure (arrival - 29min) is already ~24 minutes in
    // the past by the time this runs.
    const nearArrival = new Date(Date.now() + 5 * 60 * 1000);

    const result = await analyzeRouteTraffic({
      route: driveRoute(),
      mode: "car",
      timePreference: "arriveBy",
      tripDateTime: nearArrival,
    });

    expect(result.trafficAnalysis).toEqual({
      status: "unavailable",
      reason:
        "The selected arrival time is too close to now for this trip's baseline duration to produce a meaningful traffic estimate.",
    });
    // No wasted API call for a request that's guaranteed to fail.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses a nominal baseline departure for a non-transit Arrive By trip", async () => {
    const spy = vi.spyOn(googleTraffic, "fetchTrafficAwareRoute").mockResolvedValue(trafficFixture());
    vi.spyOn(driveBcProvider, "fetchDriveBcEvents").mockResolvedValue([]);

    const result = await analyzeRouteTraffic({
      route: driveRoute(),
      mode: "car",
      timePreference: "arriveBy",
      tripDateTime: TRIP_DATE_TIME,
    });

    expect(result.trafficAnalysis.status).toBe("analyzed");
    if (result.trafficAnalysis.status === "analyzed") {
      expect(result.trafficAnalysis.analysis.isNominalDepartureTime).toBe(true);
      // arrival - baseline (29min)
      expect(result.trafficAnalysis.analysis.commuteDepartureTime).toEqual(
        new Date(TRIP_DATE_TIME.getTime() - 29 * 60 * 1000),
      );
    }
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        departureTime: new Date(TRIP_DATE_TIME.getTime() - 29 * 60 * 1000).toISOString(),
      }),
    );
  });
});
