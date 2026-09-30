import { describe, expect, it } from "vitest";
import { buildCommuteFeatures } from "./buildFeatures";
import { forecast, route, segment, trafficResult, transitAnalysis, transitSegmentAnalysis, weatherAnalysis, weatherSample } from "./fixtures";

describe("buildCommuteFeatures", () => {
  it("builds a full feature set for a simple walk-only route with weather data", () => {
    const r = route([segment({ id: "seg-1", mode: "walk", durationMinutes: 15 })]);
    const weather = weatherAnalysis({ samples: [weatherSample("seg-1", [forecast({ temperatureC: 5 })])] });

    const features = buildCommuteFeatures({ route: r, weather, traffic: null, transit: null, now: new Date("2026-09-24T14:00:00Z") });

    expect(features.segments).toHaveLength(1);
    expect(features.segments[0].weather.availability).toBe("available");
    expect(features.segments[0].traffic.availability).toBe("not-applicable");
    expect(features.segments[0].transit.availability).toBe("not-applicable");
    expect(features.dataCoverage.weather).toBe("complete");
    expect(features.dataCoverage.traffic).toBe("unavailable"); // null input = app-level fetch failure, not "not-applicable" here since we passed null deliberately
  });

  it("computes routeDurationShare per segment relative to total route duration", () => {
    const r = route([
      segment({ id: "s1", mode: "walk", durationMinutes: 10 }),
      segment({ id: "s2", mode: "bus", durationMinutes: 30 }),
    ]);
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: null });
    expect(features.segments[0].routeDurationShare).toBeCloseTo(0.25, 5);
    expect(features.segments[1].routeDurationShare).toBeCloseTo(0.75, 5);
  });

  it("marks traffic coverage 'not-applicable' for a non-drive trip with a real (successful) traffic result", () => {
    const r = route([segment({ id: "s1", mode: "bus" })]);
    const traffic = trafficResult({ trafficAnalysis: { status: "not-applicable", reason: "bus" } });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic, transit: null });
    expect(features.dataCoverage.traffic).toBe("not-applicable");
  });

  it("marks transit coverage 'realtime' when every matched segment has a realtime update", () => {
    const r = route([segment({ id: "s1", mode: "bus" })]);
    const transit = transitAnalysis({
      transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled" } })],
    });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit });
    expect(features.dataCoverage.transit).toBe("realtime");
  });

  it("marks transit coverage 'partial' when segments are a mix of matched and unmatched", () => {
    const r = route([segment({ id: "s1", mode: "bus" }), segment({ id: "s2", mode: "rail" })]);
    const transit = transitAnalysis({
      transitSegments: [
        transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled" } }),
        transitSegmentAnalysis({ routeSegmentId: "s2", status: "unmatched", match: { quality: "unmatched", evidence: [] } }),
      ],
    });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit });
    expect(features.dataCoverage.transit).toBe("partial");
  });

  it("does not call TransLink-shaped feature builders for a pure car route (transit not-applicable)", () => {
    const r = route([segment({ id: "s1", mode: "drive" })]);
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "no transit segments" }) });
    expect(features.dataCoverage.transit).toBe("not-applicable");
    expect(features.segments[0].transit.availability).toBe("not-applicable");
  });
});
