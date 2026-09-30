import { describe, expect, it } from "vitest";
import { buildRouteTrafficFeatures, buildSegmentTrafficFeatures } from "./trafficFeatures";
import { segment, trafficAnalysis, trafficResult } from "./fixtures";

describe("buildRouteTrafficFeatures", () => {
  it("returns 'unavailable' when the fetch failed entirely (null)", () => {
    expect(buildRouteTrafficFeatures(null).availability).toBe("unavailable");
  });

  it("returns 'not-applicable' when the mode doesn't support traffic analysis", () => {
    const result = buildRouteTrafficFeatures(
      trafficResult({ trafficAnalysis: { status: "not-applicable", reason: "walk" } }),
    );
    expect(result.availability).toBe("not-applicable");
  });

  it("returns 'unavailable' when Google's traffic call itself failed", () => {
    const result = buildRouteTrafficFeatures(
      trafficResult({ trafficAnalysis: { status: "unavailable", reason: "network error" } }),
    );
    expect(result.availability).toBe("unavailable");
  });

  it("computes trafficDelayRatio bounded against the reference duration", () => {
    const result = buildRouteTrafficFeatures(
      trafficResult({
        trafficAnalysis: {
          status: "analyzed",
          analysis: trafficAnalysis({ referenceBaselineDurationMinutes: 20, trafficDelayMinutes: 5 }),
        },
      }),
    );
    expect(result.trafficDelayRatio).toBeCloseTo(0.25, 5);
  });

  it("returns an undefined ratio rather than dividing by zero for a zero-duration reference", () => {
    const result = buildRouteTrafficFeatures(
      trafficResult({
        trafficAnalysis: {
          status: "analyzed",
          analysis: trafficAnalysis({ referenceBaselineDurationMinutes: 0, trafficDelayMinutes: 5 }),
        },
      }),
    );
    expect(result.trafficDelayRatio).toBeUndefined();
  });

  it("computes route condition shares by real interval distance", () => {
    const result = buildRouteTrafficFeatures(
      trafficResult({
        trafficAnalysis: {
          status: "analyzed",
          analysis: trafficAnalysis({
            intervals: [
              { startPolylineIndex: 0, endPolylineIndex: 1, condition: "normal", distanceMeters: 800 },
              { startPolylineIndex: 1, endPolylineIndex: 2, condition: "trafficJam", distanceMeters: 200 },
            ],
          }),
        },
      }),
    );
    expect(result.normalRouteShare).toBeCloseTo(0.8, 5);
    expect(result.trafficJamRouteShare).toBeCloseTo(0.2, 5);
  });
});

describe("buildSegmentTrafficFeatures", () => {
  it("is 'not-applicable' for a non-drive segment regardless of route-level availability", () => {
    const routeFeatures = buildRouteTrafficFeatures(trafficResult());
    const result = buildSegmentTrafficFeatures(segment({ mode: "bus" }), routeFeatures);
    expect(result.availability).toBe("not-applicable");
  });

  it("mirrors route-level values for a drive segment when available", () => {
    const routeFeatures = buildRouteTrafficFeatures(
      trafficResult({
        trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 8 }) },
      }),
    );
    const result = buildSegmentTrafficFeatures(segment({ mode: "drive" }), routeFeatures);
    expect(result.availability).toBe("available");
    expect(result.trafficDelayMinutes).toBe(8);
  });

  it("propagates 'unavailable' to a drive segment when the route-level fetch failed", () => {
    const routeFeatures = buildRouteTrafficFeatures(null);
    const result = buildSegmentTrafficFeatures(segment({ mode: "drive" }), routeFeatures);
    expect(result.availability).toBe("unavailable");
  });
});
