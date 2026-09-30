import type { RouteSegment } from "@/lib/route/types";
import type { RouteTrafficResult, TrafficSpeedCondition } from "@/lib/traffic/types";
import type { RouteTrafficFeatures, SegmentTrafficFeatures } from "./types";

function boundedRatio(numerator: number, denominator: number): number | undefined {
  if (denominator <= 0) return undefined;
  return numerator / denominator;
}

/**
 * Route-level traffic features. `result` is `null` when the whole traffic
 * fetch failed at the app level (distinct from `trafficAnalysis.status`,
 * which represents an already-successful fetch's own internal result) —
 * both collapse to `"unavailable"` here since neither has anything to
 * derive a feature from.
 */
export function buildRouteTrafficFeatures(result: RouteTrafficResult | null): RouteTrafficFeatures {
  if (!result) return { availability: "unavailable" };

  const { trafficAnalysis } = result;
  if (trafficAnalysis.status === "not-applicable") return { availability: "not-applicable" };
  if (trafficAnalysis.status === "unavailable") return { availability: "unavailable" };

  const { analysis } = trafficAnalysis;
  const totalDistance = analysis.intervals.reduce((sum, interval) => sum + interval.distanceMeters, 0);

  const shareOf = (condition: TrafficSpeedCondition): number | undefined => {
    if (totalDistance === 0) return undefined;
    const distance = analysis.intervals
      .filter((interval) => interval.condition === condition)
      .reduce((sum, interval) => sum + interval.distanceMeters, 0);
    return distance / totalDistance;
  };

  return {
    availability: "available",
    recency: analysis.recency,
    trafficReferenceDurationMinutes: analysis.referenceBaselineDurationMinutes,
    trafficAwareDurationMinutes: analysis.trafficAwareDurationMinutes,
    trafficDelayMinutes: analysis.trafficDelayMinutes,
    trafficDelayRatio: boundedRatio(analysis.trafficDelayMinutes, analysis.referenceBaselineDurationMinutes),
    normalRouteShare: shareOf("normal"),
    slowRouteShare: shareOf("slow"),
    trafficJamRouteShare: shareOf("trafficJam"),
  };
}

/**
 * Segment-level traffic features. Google's traffic-aware analysis has no
 * finer breakdown than "the whole DRIVE route" in WinterRoute's current
 * domain model (`speedReadingIntervals` index into the traffic-aware
 * response's own polyline, not into logical `RouteSegment` boundaries) —
 * a `drive` segment is attributed the same route-level values rather than
 * a fabricated per-segment split. Documented as a V0 simplification; see
 * docs/decisions/0008-risk-model-v0.md.
 */
export function buildSegmentTrafficFeatures(
  segment: RouteSegment,
  routeFeatures: RouteTrafficFeatures,
): SegmentTrafficFeatures {
  if (segment.mode !== "drive") return { availability: "not-applicable" };
  if (routeFeatures.availability !== "available") return { availability: routeFeatures.availability };

  return {
    availability: "available",
    trafficDelayMinutes: routeFeatures.trafficDelayMinutes,
    trafficDelayRatio: routeFeatures.trafficDelayRatio,
    normalRouteShare: routeFeatures.normalRouteShare,
    slowRouteShare: routeFeatures.slowRouteShare,
    trafficJamRouteShare: routeFeatures.trafficJamRouteShare,
  };
}
