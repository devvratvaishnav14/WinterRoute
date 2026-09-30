import { describe, expect, it } from "vitest";
import type { RoadEvent } from "@/lib/traffic/types";
import { buildCommuteFeatures } from "./buildFeatures";
import { scoreRoadEventFactor } from "./roadEventScore";
import { route, segment, trafficResult } from "./fixtures";

function event(overrides: Partial<RoadEvent> = {}): RoadEvent {
  return {
    provider: "drivebc",
    id: "E1",
    eventType: "incident",
    headline: "Incident",
    description: "",
    severity: "moderate",
    timeRelevance: "overlaps",
    geometry: { type: "Point", coordinates: [-123.1, 49.28] },
    ...overrides,
  };
}

function featuresWithEvents(events: RoadEvent[]) {
  const r = route([segment({ id: "s1", mode: "drive", start: { label: "A", latitude: 49.28, longitude: -123.1 }, end: { label: "B", latitude: 49.281, longitude: -123.101 } })]);
  return buildCommuteFeatures({ route: r, weather: null, traffic: trafficResult({ roadEvents: events }), transit: null });
}

describe("scoreRoadEventFactor", () => {
  it("is 'unavailable' when road events couldn't be checked", () => {
    const r = route([segment({ id: "s1", mode: "drive" })]);
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: trafficResult({ roadEventStatus: "unavailable" }), transit: null });
    expect(scoreRoadEventFactor(features).status).toBe("unavailable");
  });

  it("scores zero when no relevant events exist", () => {
    expect(scoreRoadEventFactor(featuresWithEvents([])).score).toBe(0);
  });

  it("is monotonic by severity: a major event never scores below a minor one, all else equal", () => {
    const minor = scoreRoadEventFactor(featuresWithEvents([event({ severity: "minor" })])).score!;
    const moderate = scoreRoadEventFactor(featuresWithEvents([event({ severity: "moderate" })])).score!;
    const major = scoreRoadEventFactor(featuresWithEvents([event({ severity: "major" })])).score!;
    expect(moderate).toBeGreaterThanOrEqual(minor);
    expect(major).toBeGreaterThanOrEqual(moderate);
  });

  it("scores a major-severity event (the closure proxy) at or above an ordinary construction event", () => {
    const construction = scoreRoadEventFactor(featuresWithEvents([event({ eventType: "construction", severity: "moderate" })])).score!;
    const closureProxy = scoreRoadEventFactor(featuresWithEvents([event({ eventType: "incident", severity: "major" })])).score!;
    expect(closureProxy).toBeGreaterThanOrEqual(construction);
  });

  it("adds a bounded bonus for additional events rather than letting the count explode the score", () => {
    const one = scoreRoadEventFactor(featuresWithEvents([event()])).score!;
    const many = scoreRoadEventFactor(featuresWithEvents([event(), event({ id: "E2" }), event({ id: "E3" }), event({ id: "E4" }), event({ id: "E5" })])).score!;
    expect(many).toBeGreaterThan(one);
    expect(many).toBeLessThanOrEqual(100);
  });
});
