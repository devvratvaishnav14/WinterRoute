import type { Route } from "@/lib/route/types";
import type { CommuteFeatureSet } from "@/lib/scoring/types";
import type { DurationPredictionStatus } from "./types";
import type { TransitTimelineResult } from "./transitTimeline";

export interface DurationSufficiency {
  status: DurationPredictionStatus;
  reasons: string[];
}

/**
 * Duration sufficiency has DIFFERENT requirements than risk sufficiency
 * — weather may be essential to a walking RISK score, but baseline route
 * data alone can still produce a crude, defensible duration estimate
 * without it. So unlike `lib/scoring/sufficiency.ts`, weather is never
 * treated as "essential" here; the PRIMARY timing evidence per mode is
 * narrower:
 *
 * - `drive`: traffic (Google's traffic-aware duration is the strongest
 *   direct timing signal available for a car trip).
 * - `bus`/`rail`: the transit analysis succeeding at all (schedule-only
 *   is NORMAL and does not degrade this — only a total TransLink/GTFS
 *   failure does).
 * - `walk`/`cycle`: none — baseline routing alone is enough.
 *
 * `"route-disrupted"` overrides everything else once a missed connection
 * or cancellation is detected (see `transitTimeline.ts`).
 */
export function assessDurationSufficiency(
  route: Route,
  features: CommuteFeatureSet,
  timeline: TransitTimelineResult,
): DurationSufficiency {
  const hasBaseline =
    features.temporal.baselineDurationMinutes !== undefined || route.segments.some((s) => s.durationMinutes !== undefined);

  if (!hasBaseline) {
    return { status: "insufficient-data", reasons: ["No baseline route duration is available."] };
  }

  if (timeline.disrupted) {
    return { status: "route-disrupted", reasons: timeline.disruptionReasons };
  }

  const reasons: string[] = [];
  const hasDrive = features.segments.some((s) => s.mode === "drive");
  const hasTransit = features.segments.some((s) => s.mode === "bus" || s.mode === "rail");

  if (hasDrive && features.traffic.availability !== "available") {
    reasons.push("Traffic data is unavailable for the driving portion of this route.");
  }
  if (hasTransit && features.transit.availability === "unavailable") {
    reasons.push("Transit schedule data is unavailable.");
  }

  return { status: reasons.length > 0 ? "limited-data" : "available", reasons };
}
