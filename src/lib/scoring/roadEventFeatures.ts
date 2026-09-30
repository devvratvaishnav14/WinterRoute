import type { LatLng } from "@/lib/geo/geometry";
import type { RouteSegment } from "@/lib/route/types";
import { isEventNearRoute } from "@/lib/traffic/roadEvents";
import type { RoadEvent, RoadEventSeverity, RoadEventType, RouteTrafficResult } from "@/lib/traffic/types";
import type { RouteRoadEventFeatures, SegmentRoadEventFeatures } from "./types";

function segmentPath(segment: RouteSegment): LatLng[] {
  return segment.geometry && segment.geometry.length >= 2 ? segment.geometry : [segment.start, segment.end];
}

function countByType(events: RoadEvent[], type: RoadEventType): number {
  return events.filter((e) => e.eventType === type).length;
}

function countMajor(events: RoadEvent[]): number {
  return events.filter((e) => e.severity === "major").length;
}

const SEVERITY_RANK: Record<RoadEventSeverity, number> = { unknown: 0, minor: 1, moderate: 2, major: 3 };

function highestSeverityOf(events: RoadEvent[]): RoadEventSeverity | undefined {
  return events.reduce<RoadEventSeverity | undefined>(
    (highest, event) => (!highest || SEVERITY_RANK[event.severity] > SEVERITY_RANK[highest] ? event.severity : highest),
    undefined,
  );
}

function unavailableRouteFeatures(): RouteRoadEventFeatures {
  return {
    availability: "unavailable",
    relevantEventCount: 0,
    incidentCount: 0,
    constructionCount: 0,
    specialEventCount: 0,
    weatherRelatedEventCount: 0,
    majorSeverityEventCount: 0,
  };
}

function unavailableSegmentFeatures(): SegmentRoadEventFeatures {
  return {
    availability: "unavailable",
    relevantEventCount: 0,
    incidentCount: 0,
    constructionCount: 0,
    weatherRelatedEventCount: 0,
    majorSeverityEventCount: 0,
  };
}

/** Route-level road-event features from the road events the traffic pipeline already matched as spatially/temporally relevant — checked for every mode, per docs/architecture.md. */
export function buildRouteRoadEventFeatures(result: RouteTrafficResult | null): RouteRoadEventFeatures {
  if (!result || result.roadEventStatus === "unavailable") return unavailableRouteFeatures();

  const events = result.roadEvents;
  return {
    availability: "checked",
    relevantEventCount: events.length,
    incidentCount: countByType(events, "incident"),
    constructionCount: countByType(events, "construction"),
    specialEventCount: countByType(events, "specialEvent"),
    weatherRelatedEventCount: countByType(events, "weatherCondition"),
    majorSeverityEventCount: countMajor(events),
    highestSeverity: highestSeverityOf(events),
  };
}

/**
 * Segment-level road-event features, attributing each already-relevant
 * route-level event to a specific segment by real geometric proximity
 * (the same 300m threshold and point-by-point haversine check as
 * `lib/traffic/roadEvents.ts` uses for route-level relevance) — never a
 * second, looser filter.
 */
export function buildSegmentRoadEventFeatures(
  segment: RouteSegment,
  result: RouteTrafficResult | null,
): SegmentRoadEventFeatures {
  if (!result || result.roadEventStatus === "unavailable") return unavailableSegmentFeatures();

  const path = segmentPath(segment);
  const nearby = result.roadEvents.filter((event) => event.geometry && isEventNearRoute(event.geometry, path));

  return {
    availability: "checked",
    relevantEventCount: nearby.length,
    incidentCount: countByType(nearby, "incident"),
    constructionCount: countByType(nearby, "construction"),
    weatherRelatedEventCount: countByType(nearby, "weatherCondition"),
    majorSeverityEventCount: countMajor(nearby),
  };
}
