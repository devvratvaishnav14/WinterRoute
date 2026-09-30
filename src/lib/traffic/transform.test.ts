import { describe, expect, it } from "vitest";
import type { GoogleTrafficAwareResult } from "@/lib/google/trafficRoutes";
import { buildTrafficAnalysis, mapTrafficIntervals } from "./transform";

const ANALYZED_AT = new Date("2026-09-24T12:00:00Z");
const DEPARTURE = new Date("2026-09-24T14:00:00Z");

function fixture(overrides: Partial<GoogleTrafficAwareResult> = {}): GoogleTrafficAwareResult {
  return {
    durationSeconds: 2100, // 35 min
    staticDurationSeconds: 1800, // 30 min
    distanceMeters: 18000,
    speedIntervals: [],
    polyline: [],
    ...overrides,
  };
}

describe("buildTrafficAnalysis", () => {
  it("computes traffic delay as trafficAware - staticDuration", () => {
    const analysis = buildTrafficAnalysis({
      googleResult: fixture(),
      referenceBaselineDurationMinutes: 29,
      commuteDepartureTime: DEPARTURE,
      isNominalDepartureTime: false,
      analyzedAt: ANALYZED_AT,
    });

    expect(analysis.trafficAwareDurationMinutes).toBe(35);
    expect(analysis.googleStaticDurationMinutes).toBe(30);
    expect(analysis.trafficDelayMinutes).toBe(5);
    // The reference baseline (WinterRoute's own) is preserved distinctly
    // from Google's staticDuration for *this* request, even though both
    // are close — never assumed identical.
    expect(analysis.referenceBaselineDurationMinutes).toBe(29);
  });

  it("clamps a would-be-negative delay to 0 rather than showing a negative number", () => {
    const analysis = buildTrafficAnalysis({
      googleResult: fixture({ durationSeconds: 1700, staticDurationSeconds: 1800 }),
      referenceBaselineDurationMinutes: 30,
      commuteDepartureTime: DEPARTURE,
      isNominalDepartureTime: false,
      analyzedAt: ANALYZED_AT,
    });
    expect(analysis.trafficDelayMinutes).toBe(0);
  });

  it("reports zero delay when traffic-aware duration equals static duration", () => {
    const analysis = buildTrafficAnalysis({
      googleResult: fixture({ durationSeconds: 1800, staticDurationSeconds: 1800 }),
      referenceBaselineDurationMinutes: 30,
      commuteDepartureTime: DEPARTURE,
      isNominalDepartureTime: false,
      analyzedAt: ANALYZED_AT,
    });
    expect(analysis.trafficDelayMinutes).toBe(0);
  });

  it("labels a nominal departure time correctly", () => {
    const analysis = buildTrafficAnalysis({
      googleResult: fixture(),
      referenceBaselineDurationMinutes: 29,
      commuteDepartureTime: DEPARTURE,
      isNominalDepartureTime: true,
      analyzedAt: ANALYZED_AT,
    });
    expect(analysis.isNominalDepartureTime).toBe(true);
  });

  it("classifies recency based on commuteDepartureTime relative to analyzedAt", () => {
    const nearTerm = buildTrafficAnalysis({
      googleResult: fixture(),
      referenceBaselineDurationMinutes: 29,
      commuteDepartureTime: new Date(ANALYZED_AT.getTime() + 2 * 60 * 60 * 1000),
      isNominalDepartureTime: false,
      analyzedAt: ANALYZED_AT,
    });
    expect(nearTerm.recency).toBe("near-term");

    const future = buildTrafficAnalysis({
      googleResult: fixture(),
      referenceBaselineDurationMinutes: 29,
      commuteDepartureTime: new Date(ANALYZED_AT.getTime() + 70 * 60 * 60 * 1000),
      isNominalDepartureTime: false,
      analyzedAt: ANALYZED_AT,
    });
    expect(future.recency).toBe("future");
  });

  it("uses BEST_GUESS as the traffic model, always", () => {
    const analysis = buildTrafficAnalysis({
      googleResult: fixture(),
      referenceBaselineDurationMinutes: 29,
      commuteDepartureTime: DEPARTURE,
      isNominalDepartureTime: false,
      analyzedAt: ANALYZED_AT,
    });
    expect(analysis.trafficModel).toBe("BEST_GUESS");
  });
});

describe("mapTrafficIntervals", () => {
  it("maps Google speed conditions to WinterRoute's own vocabulary", () => {
    const polyline = [
      { latitude: 49.28, longitude: -122.92 },
      { latitude: 49.28, longitude: -122.93 },
      { latitude: 49.28, longitude: -122.94 },
    ];
    const intervals = mapTrafficIntervals(
      [
        { startPolylinePointIndex: 0, endPolylinePointIndex: 1, speed: "NORMAL" },
        { startPolylinePointIndex: 1, endPolylinePointIndex: 2, speed: "SLOW" },
      ],
      polyline,
    );
    expect(intervals[0].condition).toBe("normal");
    expect(intervals[1].condition).toBe("slow");
  });

  it("maps TRAFFIC_JAM correctly", () => {
    const intervals = mapTrafficIntervals(
      [{ startPolylinePointIndex: 0, endPolylinePointIndex: 1, speed: "TRAFFIC_JAM" }],
      [
        { latitude: 49.28, longitude: -122.92 },
        { latitude: 49.28, longitude: -122.93 },
      ],
    );
    expect(intervals[0].condition).toBe("trafficJam");
  });

  it("computes real distance per interval from the polyline, not a point-count guess", () => {
    // Two points exactly 0.01 degrees longitude apart at the equator ~1.1km.
    const polyline = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.01 },
      { latitude: 0, longitude: 0.02 },
    ];
    const intervals = mapTrafficIntervals(
      [{ startPolylinePointIndex: 0, endPolylinePointIndex: 2, speed: "SLOW" }],
      polyline,
    );
    expect(intervals[0].distanceMeters).toBeGreaterThan(2000);
    expect(intervals[0].distanceMeters).toBeLessThan(2300);
  });

  it("returns 0 distance for an out-of-range interval rather than throwing", () => {
    const intervals = mapTrafficIntervals(
      [{ startPolylinePointIndex: 5, endPolylinePointIndex: 9, speed: "NORMAL" }],
      [{ latitude: 0, longitude: 0 }],
    );
    expect(intervals[0].distanceMeters).toBe(0);
  });
});
