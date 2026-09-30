import { describe, expect, it } from "vitest";
import { cumulativeDistances, pointAtFraction } from "./geometry";

const A = { latitude: 49.28, longitude: -123.12 };
const B = { latitude: 49.28, longitude: -123.1 }; // due east of A
const C = { latitude: 49.29, longitude: -123.1 }; // due north of B

describe("cumulativeDistances", () => {
  it("starts at zero and is non-decreasing", () => {
    const distances = cumulativeDistances([A, B, C]);
    expect(distances[0]).toBe(0);
    expect(distances.length).toBe(3);
    expect(distances[1]).toBeGreaterThan(0);
    expect(distances[2]).toBeGreaterThan(distances[1]);
  });

  it("reports zero total distance for a single repeated point", () => {
    expect(cumulativeDistances([A, A, A])).toEqual([0, 0, 0]);
  });
});

describe("pointAtFraction — cumulative-distance interpolation", () => {
  it("returns the first point at fraction 0 and the last point at fraction 1", () => {
    const points = [A, B, C];
    expect(pointAtFraction(points, 0)).toEqual(A);
    const end = pointAtFraction(points, 1);
    expect(end.latitude).toBeCloseTo(C.latitude, 6);
    expect(end.longitude).toBeCloseTo(C.longitude, 6);
  });

  it("interpolates a midpoint strictly between the two points on a two-point line", () => {
    const mid = pointAtFraction([A, B], 0.5);
    expect(mid.latitude).toBeCloseTo(A.latitude, 6);
    expect(mid.longitude).toBeCloseTo((A.longitude + B.longitude) / 2, 6);
  });

  it("clamps fractions outside [0, 1]", () => {
    const points = [A, B];
    expect(pointAtFraction(points, -0.5)).toEqual(pointAtFraction(points, 0));
    expect(pointAtFraction(points, 1.5)).toEqual(pointAtFraction(points, 1));
  });

  it("advances further along a multi-point polyline as fraction increases through each leg", () => {
    const points = [A, B, C];
    const early = pointAtFraction(points, 0.25);
    const late = pointAtFraction(points, 0.75);
    // Early fraction should still be on the A->B leg (same latitude as A/B); late fraction should be on the B->C leg (having moved north).
    expect(early.latitude).toBeCloseTo(A.latitude, 3);
    expect(late.latitude).toBeGreaterThan(early.latitude);
  });

  it("falls back to the single point for a zero-length/degenerate polyline, never throwing", () => {
    expect(pointAtFraction([], 0.5)).toEqual({ latitude: 0, longitude: 0 });
    expect(pointAtFraction([A], 0.5)).toEqual(A);
    expect(pointAtFraction([A, A, A], 0.5)).toEqual(A);
  });
});
