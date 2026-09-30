import type { Route } from "@/lib/route/types";
import type { RouteWeatherAnalysis } from "@/lib/weather/types";
import type { RouteTrafficResult } from "@/lib/traffic/types";
import type { TransitAnalysis } from "@/lib/transit/types";
import { buildTemporalFeatures } from "./temporalFeatures";
import { buildRouteWeatherFeatures, buildSegmentWeatherFeatures } from "./weatherFeatures";
import { buildRouteTrafficFeatures, buildSegmentTrafficFeatures } from "./trafficFeatures";
import { buildRouteRoadEventFeatures, buildSegmentRoadEventFeatures } from "./roadEventFeatures";
import { buildRouteTransitFeatures, buildSegmentTransitFeatures } from "./transitFeatures";
import type { CommuteFeatureSet, DataCoverage, SegmentFeatureSet } from "./types";

export interface BuildFeaturesInput {
  route: Route;
  /** `null` means the weather fetch failed at the app level entirely — distinct from a successful fetch whose own internal status is "unavailable" for a sub-source. */
  weather: RouteWeatherAnalysis | null;
  traffic: RouteTrafficResult | null;
  transit: TransitAnalysis | null;
  /** The analysis instant — injectable for deterministic tests. */
  now?: Date;
}

function trafficCoverage(availability: "available" | "not-applicable" | "not-yet-available" | "unavailable"): DataCoverage["traffic"] {
  switch (availability) {
    case "available":
      return "complete";
    case "not-applicable":
      return "not-applicable";
    default:
      return "unavailable";
  }
}

function transitCoverage(transit: TransitAnalysis | null, segmentCount: number, realtimeCount: number, scheduleOnlyCount: number): DataCoverage["transit"] {
  if (!transit || transit.status === "unavailable") return "unavailable";
  if (transit.status === "not-applicable") return "not-applicable";
  if (segmentCount > 0 && realtimeCount === segmentCount) return "realtime";
  if (segmentCount > 0 && scheduleOnlyCount === segmentCount) return "scheduled-only";
  return "partial";
}

/**
 * Builds WinterRoute's V0 feature set from already-collected factual data.
 * Purely a transformation — no fetching, no I/O, deterministic given the
 * same inputs (and the same `now`). See docs/architecture.md "Feature
 * engineering architecture."
 */
export function buildCommuteFeatures(input: BuildFeaturesInput): CommuteFeatureSet {
  const { route, weather, traffic, transit, now = new Date() } = input;

  const temporal = buildTemporalFeatures(route, now);
  const routeTrafficFeatures = buildRouteTrafficFeatures(traffic);
  const routeRoadEventFeatures = buildRouteRoadEventFeatures(traffic);
  const routeTransitFeatures = buildRouteTransitFeatures(transit);

  const totalDurationMinutes = route.segments.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  const samples = weather?.samples ?? [];

  const segments: SegmentFeatureSet[] = route.segments.map((segment) => ({
    segmentId: segment.id,
    mode: segment.mode,
    durationMinutes: segment.durationMinutes,
    distanceMeters: segment.distanceMeters,
    routeDurationShare:
      totalDurationMinutes > 0 && segment.durationMinutes !== undefined
        ? segment.durationMinutes / totalDurationMinutes
        : undefined,
    weather: buildSegmentWeatherFeatures(segment, samples),
    traffic: buildSegmentTrafficFeatures(segment, routeTrafficFeatures),
    transit: buildSegmentTransitFeatures(segment, transit),
    roadEvents: buildSegmentRoadEventFeatures(segment, traffic),
  }));

  const routeWeatherFeatures = buildRouteWeatherFeatures(weather, segments);

  const dataCoverage: DataCoverage = {
    weather: routeWeatherFeatures.availability,
    traffic: trafficCoverage(routeTrafficFeatures.availability),
    transit: transitCoverage(
      transit,
      routeTransitFeatures.transitSegmentCount,
      routeTransitFeatures.realtimeMatchedSegmentCount,
      routeTransitFeatures.scheduleOnlySegmentCount,
    ),
    roadEvents: routeRoadEventFeatures.availability,
    weatherModelsAvailable: routeWeatherFeatures.modelsAvailable,
    weatherSamplePoints: routeWeatherFeatures.samplePointCount,
    transitRealtimeMatchedSegments: routeTransitFeatures.realtimeMatchedSegmentCount,
  };

  return {
    originLabel: route.origin.label,
    destinationLabel: route.destination.label,
    totalDistanceMeters: route.totalDistanceMeters,
    temporal,
    weather: routeWeatherFeatures,
    traffic: routeTrafficFeatures,
    roadEvents: routeRoadEventFeatures,
    transit: routeTransitFeatures,
    segments,
    dataCoverage,
  };
}
