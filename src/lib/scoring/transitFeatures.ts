import type { RouteSegment } from "@/lib/route/types";
import type { TransitAlertEffect, TransitAnalysis } from "@/lib/transit/types";
import type { RouteTransitFeatures, SegmentTransitFeatures } from "./types";

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Transit features for one `bus`/`rail` segment. `availability` is a
 * coarse gate; the finer "no realtime yet vs. genuinely unmatched"
 * distinction lives in `status` itself (`TransitSegmentStatus`), which
 * `transitScore.ts` interprets directly rather than needing it
 * re-encoded here.
 */
export function buildSegmentTransitFeatures(
  segment: RouteSegment,
  transitAnalysis: TransitAnalysis | null,
): SegmentTransitFeatures {
  if (segment.mode !== "bus" && segment.mode !== "rail") {
    return { availability: "not-applicable", isCanceled: false, hasSkippedStop: false, relevantAlertCount: 0 };
  }

  if (!transitAnalysis || transitAnalysis.status !== "analyzed") {
    return { availability: "unavailable", isCanceled: false, hasSkippedStop: false, relevantAlertCount: 0 };
  }

  const segmentAnalysis = transitAnalysis.transitSegments.find((s) => s.routeSegmentId === segment.id);
  if (!segmentAnalysis || segmentAnalysis.status === "unmatched") {
    return {
      availability: "unavailable",
      status: segmentAnalysis?.status,
      matchQuality: segmentAnalysis?.match.quality,
      isCanceled: false,
      hasSkippedStop: false,
      relevantAlertCount: 0,
    };
  }

  const { realtime } = segmentAnalysis;

  return {
    availability: "available",
    status: segmentAnalysis.status,
    matchQuality: segmentAnalysis.match.quality,
    departureDelaySeconds: realtime?.departureDelaySeconds,
    arrivalDelaySeconds: realtime?.arrivalDelaySeconds,
    isCanceled: realtime?.tripStatus === "canceled",
    hasSkippedStop: realtime?.departureStopStatus === "skipped" || realtime?.arrivalStopStatus === "skipped",
    relevantAlertCount: segmentAnalysis.relevantAlerts.length,
  };
}

function unavailableRouteFeatures(): RouteTransitFeatures {
  return {
    availability: "unavailable",
    transitSegmentCount: 0,
    realtimeMatchedSegmentCount: 0,
    scheduleOnlySegmentCount: 0,
    unmatchedSegmentCount: 0,
    canceledSegmentCount: 0,
    skippedStopSegmentCount: 0,
    relevantSegmentAlertCount: 0,
    relevantSystemAlertCount: 0,
    relevantAlertEffects: [],
    transferCount: 0,
  };
}

/** Route-level transit features, aggregated across every real `bus`/`rail` segment TransLink enrichment was attempted for. */
export function buildRouteTransitFeatures(transitAnalysis: TransitAnalysis | null): RouteTransitFeatures {
  if (!transitAnalysis || transitAnalysis.status === "unavailable") return unavailableRouteFeatures();
  if (transitAnalysis.status === "not-applicable") {
    return { ...unavailableRouteFeatures(), availability: "not-applicable" };
  }

  const segments = transitAnalysis.transitSegments;
  const realtimeMatched = segments.filter((s) => s.status === "matched-with-realtime");
  const scheduleOnly = segments.filter((s) => s.status === "matched-schedule-only");
  const unmatched = segments.filter((s) => s.status === "unmatched");

  const delays = realtimeMatched
    .map((s) => s.realtime?.departureDelaySeconds ?? s.realtime?.arrivalDelaySeconds)
    .filter((v): v is number => v !== undefined);
  const departureDelays = realtimeMatched
    .map((s) => s.realtime?.departureDelaySeconds)
    .filter((v): v is number => v !== undefined);
  const arrivalDelays = realtimeMatched
    .map((s) => s.realtime?.arrivalDelaySeconds)
    .filter((v): v is number => v !== undefined);

  const canceledSegmentCount = segments.filter((s) => s.realtime?.tripStatus === "canceled").length;
  const skippedStopSegmentCount = segments.filter(
    (s) => s.realtime?.departureStopStatus === "skipped" || s.realtime?.arrivalStopStatus === "skipped",
  ).length;

  const relevantSegmentAlertCount = segments.reduce((sum, s) => sum + s.relevantAlerts.length, 0);
  const relevantAlertEffects = Array.from(
    new Set<TransitAlertEffect>([
      ...segments.flatMap((s) => s.relevantAlerts.map((a) => a.effect)),
      ...transitAnalysis.systemAlerts.map((a) => a.effect),
    ]),
  );

  const availability: RouteTransitFeatures["availability"] =
    realtimeMatched.length > 0
      ? "available"
      : scheduleOnly.length > 0
        ? "not-yet-available"
        : "unavailable";

  return {
    availability,
    transitSegmentCount: segments.length,
    realtimeMatchedSegmentCount: realtimeMatched.length,
    scheduleOnlySegmentCount: scheduleOnly.length,
    unmatchedSegmentCount: unmatched.length,
    maxDepartureDelaySeconds: departureDelays.length ? Math.max(...departureDelays) : undefined,
    maxArrivalDelaySeconds: arrivalDelays.length ? Math.max(...arrivalDelays) : undefined,
    meanDelaySecondsAcrossRealtimeSegments: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : undefined,
    medianDelaySecondsAcrossRealtimeSegments: median(delays),
    canceledSegmentCount,
    skippedStopSegmentCount,
    relevantSegmentAlertCount,
    relevantSystemAlertCount: transitAnalysis.systemAlerts.length,
    relevantAlertEffects,
    transferCount: Math.max(0, segments.length - 1),
  };
}
