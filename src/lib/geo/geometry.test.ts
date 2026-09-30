import { describe, expect, it } from "vitest";
import { haversineDistanceMeters, pointAtFractionAlongPath } from "./geometry";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    const p = { latitude: 49.28, longitude: -122.92 };
    expect(haversineDistanceMeters(p, p)).toBe(0);
  });

  it("returns a plausible distance for two known Metro Vancouver points", () => {
    // SFU Burnaby to Waterfront Station, Vancouver — roughly 16km as the crow flies.
    const sfu = { latitude: 49.2781, longitude: -122.9199 };
    const waterfront = { latitude: 49.2856, longitude: -123.1114 };
    const distance = haversineDistanceMeters(sfu, waterfront);
    expect(distance).toBeGreaterThan(13_000);
    expect(distance).toBeLessThan(18_000);
  });
});

describe("pointAtFractionAlongPath", () => {
  const straightPath = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 10 },
  ];

  it("returns the start point at fraction 0", () => {
    expect(pointAtFractionAlongPath(straightPath, 0)).toEqual(straightPath[0]);
  });

  it("returns the end point at fraction 1", () => {
    expect(pointAtFractionAlongPath(straightPath, 1)).toEqual(straightPath[1]);
  });

  it("returns the midpoint at fraction 0.5 for an evenly-spaced path", () => {
    const mid = pointAtFractionAlongPath(straightPath, 0.5);
    expect(mid.longitude).toBeCloseTo(5, 5);
    expect(mid.latitude).toBeCloseTo(0, 5);
  });

  it("weights by actual distance, not by point index, for unevenly-spaced paths", () => {
    // Three points where the first segment is much longer than the second.
    const path = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 9 }, // 90% of the total distance
      { latitude: 0, longitude: 10 }, // remaining 10%
    ];
    // The midpoint by distance should fall within the first (long) segment,
    // not land exactly on the middle *index* (which would be longitude 9).
    const mid = pointAtFractionAlongPath(path, 0.5);
    expect(mid.longitude).toBeCloseTo(5, 1);
  });

  it("clamps out-of-range fractions", () => {
    expect(pointAtFractionAlongPath(straightPath, -1)).toEqual(straightPath[0]);
    expect(pointAtFractionAlongPath(straightPath, 2)).toEqual(straightPath[1]);
  });

  it("returns the single point for a one-point path", () => {
    const single = [{ latitude: 1, longitude: 2 }];
    expect(pointAtFractionAlongPath(single, 0.5)).toEqual(single[0]);
  });
});
