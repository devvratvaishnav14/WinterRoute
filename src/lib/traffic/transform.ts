import { haversineDistanceMeters } from "@/lib/geo/geometry";
import type { GoogleLatLng } from "@/lib/google/routes";
import type { GoogleSpeedCondition, GoogleTrafficAwareResult } from "@/lib/google/trafficRoutes";
import { classifyTrafficRecency } from "./timeline";
import type { TrafficAnalysis, TrafficInterval, TrafficSpeedCondition } from "./types";

function mapSpeedCondition(speed: GoogleSpeedCondition): TrafficSpeedCondition {
  switch (speed) {
    case "NORMAL":
      return "normal";
    case "SLOW":
      return "slow";
    case "TRAFFIC_JAM":
      return "trafficJam";
  }
}

/** Sum of real distances between consecutive polyline points from index `start` to `end` (inclusive/exclusive per Google's convention). */
function intervalDistanceMeters(polyline: GoogleLatLng[], start: number, end: number): number {
  let total = 0;
  for (let i = Math.max(0, start); i < Math.min(end, polyline.length - 1); i++) {
    total += haversineDistanceMeters(polyline[i], polyline[i + 1]);
  }
  return total;
}

export function mapTrafficIntervals(
  intervals: GoogleTrafficAwareResult["speedIntervals"],
  polyline: GoogleLatLng[],
): TrafficInterval[] {
  return intervals.map((interval) => ({
    startPolylineIndex: interval.startPolylinePointIndex,
    endPolylineIndex: interval.endPolylinePointIndex,
    condition: mapSpeedCondition(interval.speed),
    distanceMeters: intervalDistanceMeters(polyline, interval.startPolylinePointIndex, interval.endPolylinePointIndex),
  }));
}

export interface BuildTrafficAnalysisParams {
  googleResult: GoogleTrafficAwareResult;
  referenceBaselineDurationMinutes: number;
  commuteDepartureTime: Date;
  isNominalDepartureTime: boolean;
  analyzedAt: Date;
}

/**
 * Converts a raw Google traffic-aware result into WinterRoute's
 * `TrafficAnalysis`. Delay is `trafficAwareDurationMinutes -
 * googleStaticDurationMinutes`, clamped to >= 0: Google's traffic-aware
 * `duration` should never be shorter than its own `staticDuration`, but
 * this guards against a negative "delay" from rounding or an edge case
 * rather than ever showing one — a negative delay isn't a meaningful
 * concept to surface.
 */
export function buildTrafficAnalysis(params: BuildTrafficAnalysisParams): TrafficAnalysis {
  const { googleResult, referenceBaselineDurationMinutes, commuteDepartureTime, isNominalDepartureTime, analyzedAt } =
    params;

  const trafficAwareDurationMinutes = Math.round(googleResult.durationSeconds / 60);
  const googleStaticDurationMinutes = Math.round(googleResult.staticDurationSeconds / 60);
  const trafficDelayMinutes = Math.max(0, trafficAwareDurationMinutes - googleStaticDurationMinutes);

  return {
    provider: "google-routes",
    analyzedAt,
    commuteDepartureTime,
    isNominalDepartureTime,
    recency: classifyTrafficRecency(commuteDepartureTime, analyzedAt),
    referenceBaselineDurationMinutes,
    googleStaticDurationMinutes,
    trafficAwareDurationMinutes,
    trafficDelayMinutes,
    trafficModel: "BEST_GUESS",
    distanceMeters: googleResult.distanceMeters,
    intervals: mapTrafficIntervals(googleResult.speedIntervals, googleResult.polyline),
  };
}
