import { describe, expect, it } from "vitest";
import { buildCommuteFeatures } from "@/lib/scoring/buildFeatures";
import { route, segment, trafficAnalysis, trafficResult, transitAnalysis, transitSegmentAnalysis, weatherAnalysis, weatherSample, forecast } from "@/lib/scoring/fixtures";
import { assessDurationSufficiency } from "./sufficiency";
import { analyzeTransitTimeline } from "./transitTimeline";

const NOW = new Date("2026-09-24T14:00:00Z");

describe("assessDurationSufficiency", () => {
  it("is 'available' for a drive trip with traffic data present", () => {
    const r = route([segment({ id: "s1", mode: "drive" })]);
    const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis() } });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: NOW });
    const timeline = analyzeTransitTimeline(r, null);
    expect(assessDurationSufficiency(r, features, timeline).status).toBe("available");
  });

  it("is 'limited-data' for a drive trip with no traffic data, even though weather is present (weather is not essential for duration)", () => {
    const r = route([segment({ id: "s1", mode: "drive" })]);
    const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast()])] });
    const features = buildCommuteFeatures({ route: r, weather, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: NOW });
    const timeline = analyzeTransitTimeline(r, null);
    expect(assessDurationSufficiency(r, features, timeline).status).toBe("limited-data");
  });

  it("is 'available' for a walk trip even with no weather data at all (baseline alone is enough)", () => {
    const r = route([segment({ id: "s1", mode: "walk" })]);
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "walk" }), now: NOW });
    const timeline = analyzeTransitTimeline(r, null);
    expect(assessDurationSufficiency(r, features, timeline).status).toBe("available");
  });

  it("is 'available' for a transit trip with schedule only, tomorrow — not automatically limited just because realtime is absent", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transit = transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only" })] });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit, now: NOW });
    const timeline = analyzeTransitTimeline(r, transit);
    expect(assessDurationSufficiency(r, features, timeline).status).toBe("available");
  });

  it("is 'limited-data' for a transit trip when GTFS/transit itself is entirely unavailable", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transit = transitAnalysis({ status: "unavailable", reason: "GTFS static unavailable" });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit, now: NOW });
    const timeline = analyzeTransitTimeline(r, transit);
    expect(assessDurationSufficiency(r, features, timeline).status).toBe("limited-data");
  });

  it("is 'route-disrupted' when the timeline detects a missed connection or cancellation, overriding everything else", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const transit = transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "canceled" } })] });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit, now: NOW });
    const timeline = analyzeTransitTimeline(r, transit);
    expect(assessDurationSufficiency(r, features, timeline).status).toBe("route-disrupted");
  });

  it("is 'insufficient-data' when there's no baseline duration at all", () => {
    const r = route([segment({ id: "s1", mode: "drive", durationMinutes: undefined })], { baselineDurationMinutes: undefined });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: NOW });
    const timeline = analyzeTransitTimeline(r, null);
    expect(assessDurationSufficiency(r, features, timeline).status).toBe("insufficient-data");
  });
});
