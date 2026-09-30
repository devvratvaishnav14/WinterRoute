import { describe, expect, it } from "vitest";
import { assessPredictionSufficiency } from "./sufficiency";
import { buildCommuteFeatures } from "./buildFeatures";
import { scoreRoadEventFactor } from "./roadEventScore";
import { scoreTrafficFactor } from "./trafficScore";
import { scoreTransitFactor } from "./transitScore";
import { scoreWeatherFactor } from "./weatherScore";
import {
  forecast,
  route,
  segment,
  trafficAnalysis,
  trafficResult,
  transitAnalysis,
  transitSegmentAnalysis,
  weatherAnalysis,
  weatherSample,
} from "./fixtures";

function scoreAll(features: ReturnType<typeof buildCommuteFeatures>) {
  return {
    weather: scoreWeatherFactor(features),
    traffic: scoreTrafficFactor(features),
    transit: scoreTransitFactor(features),
    roadEvents: scoreRoadEventFactor(features),
  };
}

const NOW = new Date("2026-09-24T14:00:00Z");

describe("assessPredictionSufficiency", () => {
  it("is 'available' when every applicable factor is scored (walk trip)", () => {
    const r = route([segment({ id: "s1", mode: "walk" })]);
    const features = buildCommuteFeatures({
      route: r,
      weather: weatherAnalysis({ samples: [weatherSample("s1", [forecast()])] }),
      traffic: trafficResult({ trafficAnalysis: { status: "not-applicable", reason: "walk" } }),
      transit: transitAnalysis({ status: "not-applicable", reason: "no transit segments" }),
      now: NOW,
    });
    expect(assessPredictionSufficiency(features, scoreAll(features)).status).toBe("available");
  });

  it("is 'insufficient-data' for a walk trip with no weather evidence at all, even if road events were checked successfully", () => {
    const r = route([segment({ id: "s1", mode: "walk" })]);
    const features = buildCommuteFeatures({
      route: r,
      weather: null, // weather is walk's only essential factor
      traffic: trafficResult({ trafficAnalysis: { status: "not-applicable", reason: "walk" }, roadEvents: [] }),
      transit: transitAnalysis({ status: "not-applicable", reason: "no transit segments" }),
      now: NOW,
    });
    const result = assessPredictionSufficiency(features, scoreAll(features));
    expect(result.status).toBe("insufficient-data");
    expect(result.reasons.some((r) => r.includes("Weather"))).toBe(true);
  });

  it("is 'limited-data' for a drive trip with weather available but traffic unavailable (the documented example)", () => {
    const r = route([segment({ id: "s1", mode: "drive" })]);
    const features = buildCommuteFeatures({
      route: r,
      weather: weatherAnalysis({ samples: [weatherSample("s1", [forecast()])] }),
      traffic: null, // traffic fetch failed entirely
      transit: transitAnalysis({ status: "not-applicable", reason: "no transit segments" }),
      now: NOW,
    });
    const result = assessPredictionSufficiency(features, scoreAll(features));
    expect(result.status).toBe("limited-data");
    expect(result.missingSources).toContain("traffic");
  });

  it("is 'insufficient-data' for a drive trip when BOTH weather and traffic are unavailable, even if road events succeeded", () => {
    const r = route([segment({ id: "s1", mode: "drive" })]);
    const features = buildCommuteFeatures({
      route: r,
      weather: null,
      traffic: null,
      transit: transitAnalysis({ status: "not-applicable", reason: "no transit segments" }),
      now: NOW,
    });
    expect(assessPredictionSufficiency(features, scoreAll(features)).status).toBe("insufficient-data");
  });

  it("is 'available' for a drive trip with weather + traffic + road events all present", () => {
    const r = route([segment({ id: "s1", mode: "drive" })]);
    const features = buildCommuteFeatures({
      route: r,
      weather: weatherAnalysis({ samples: [weatherSample("s1", [forecast()])] }),
      traffic: trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis() } }),
      transit: transitAnalysis({ status: "not-applicable", reason: "no transit segments" }),
      now: NOW,
    });
    expect(assessPredictionSufficiency(features, scoreAll(features)).status).toBe("available");
  });

  it("treats a far-future transit trip with no realtime yet as 'available', not insufficient (forecast-horizon-aware by construction)", () => {
    const r = route([segment({ id: "s1", mode: "bus", durationMinutes: 30 })]);
    const features = buildCommuteFeatures({
      route: r,
      weather: weatherAnalysis({ samples: [weatherSample("s1", [forecast()])] }),
      traffic: trafficResult({ trafficAnalysis: { status: "not-applicable", reason: "bus" } }),
      transit: transitAnalysis({
        transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-schedule-only" })],
      }),
      now: NOW,
    });
    const result = assessPredictionSufficiency(features, scoreAll(features));
    // Transit is scheduled-only (not unavailable) — it counts as real, essential evidence,
    // not a disqualifying gap just because the trip is far enough out that no realtime exists yet.
    expect(result.status).toBe("available");
  });

  it("is 'insufficient-data' for a transit trip when GTFS itself is entirely unavailable", () => {
    const r = route([segment({ id: "s1", mode: "bus", durationMinutes: 30 })]);
    const features = buildCommuteFeatures({
      route: r,
      weather: null,
      traffic: null,
      transit: transitAnalysis({ status: "unavailable", reason: "GTFS static unavailable" }),
      now: NOW,
    });
    expect(assessPredictionSufficiency(features, scoreAll(features)).status).toBe("insufficient-data");
  });

  it("is 'insufficient-data' when literally every applicable source failed", () => {
    const r = route([segment({ id: "s1", mode: "drive" })]);
    const features = buildCommuteFeatures({
      route: r,
      weather: null,
      traffic: trafficResult({ trafficAnalysis: { status: "unavailable", reason: "network error" }, roadEventStatus: "unavailable" }),
      transit: transitAnalysis({ status: "not-applicable", reason: "no transit segments" }),
      now: NOW,
    });
    expect(assessPredictionSufficiency(features, scoreAll(features)).status).toBe("insufficient-data");
  });

  it("computes the essential set for a mixed walk+bus trip as the union of both modes' essentials", () => {
    const r = route([
      segment({ id: "s1", mode: "walk", durationMinutes: 5 }),
      segment({ id: "s2", mode: "bus", durationMinutes: 25 }),
    ]);
    // Weather is unavailable, but transit (bus's essential factor) is scored — should NOT be insufficient.
    const features = buildCommuteFeatures({
      route: r,
      weather: null,
      traffic: null,
      transit: transitAnalysis({
        transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s2", status: "matched-schedule-only" })],
      }),
      now: NOW,
    });
    const result = assessPredictionSufficiency(features, scoreAll(features));
    expect(result.status).toBe("limited-data"); // weather still missing and applicable, so not fully "available"
  });
});
