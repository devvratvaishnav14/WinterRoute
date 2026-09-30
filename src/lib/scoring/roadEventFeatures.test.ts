import { describe, expect, it } from "vitest";
import type { RoadEvent } from "@/lib/traffic/types";
import { buildRouteRoadEventFeatures, buildSegmentRoadEventFeatures } from "./roadEventFeatures";
import { segment, trafficResult } from "./fixtures";

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

describe("buildRouteRoadEventFeatures", () => {
  it("returns 'unavailable' when the fetch failed entirely (null)", () => {
    expect(buildRouteRoadEventFeatures(null).availability).toBe("unavailable");
  });

  it("returns 'unavailable' when road events specifically failed to check", () => {
    const result = buildRouteRoadEventFeatures(trafficResult({ roadEventStatus: "unavailable" }));
    expect(result.availability).toBe("unavailable");
  });

  it("counts events by type and identifies the highest severity", () => {
    const result = buildRouteRoadEventFeatures(
      trafficResult({
        roadEvents: [event({ eventType: "incident", severity: "minor" }), event({ eventType: "construction", severity: "major" })],
      }),
    );
    expect(result.relevantEventCount).toBe(2);
    expect(result.incidentCount).toBe(1);
    expect(result.constructionCount).toBe(1);
    expect(result.highestSeverity).toBe("major");
    expect(result.majorSeverityEventCount).toBe(1);
  });

  it("returns 'checked' with zero counts when there genuinely are no relevant events", () => {
    const result = buildRouteRoadEventFeatures(trafficResult({ roadEvents: [] }));
    expect(result.availability).toBe("checked");
    expect(result.relevantEventCount).toBe(0);
  });
});

describe("buildSegmentRoadEventFeatures", () => {
  const nearSegment = segment({
    start: { label: "A", latitude: 49.28, longitude: -123.1 },
    end: { label: "B", latitude: 49.2801, longitude: -123.1001 },
  });
  const farSegment = segment({
    start: { label: "C", latitude: 49.5, longitude: -122.5 },
    end: { label: "D", latitude: 49.51, longitude: -122.51 },
  });

  it("attributes an event only to a segment it's actually near", () => {
    const result = trafficResult({ roadEvents: [event()] });
    expect(buildSegmentRoadEventFeatures(nearSegment, result).relevantEventCount).toBe(1);
    expect(buildSegmentRoadEventFeatures(farSegment, result).relevantEventCount).toBe(0);
  });

  it("returns 'unavailable' when road events couldn't be checked", () => {
    const result = trafficResult({ roadEventStatus: "unavailable" });
    expect(buildSegmentRoadEventFeatures(nearSegment, result).availability).toBe("unavailable");
  });

  it("excludes an event with no usable geometry rather than assuming relevance", () => {
    const result = trafficResult({ roadEvents: [event({ geometry: undefined })] });
    expect(buildSegmentRoadEventFeatures(nearSegment, result).relevantEventCount).toBe(0);
  });
});
