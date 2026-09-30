import type { Route, RouteSegment } from "@/lib/route/types";
import { deriveSegmentTimes } from "@/lib/route/timeline";
import type { TimePreference } from "@/lib/trip/types";

export interface WeatherTimeline {
  segments: RouteSegment[];
  /**
   * True only when these times were derived from a nominal (not
   * recommended) baseline departure for a non-transit "Arrive by" trip.
   */
  usedNominalBaseline: boolean;
}

/**
 * Resolves the segment timeline WinterRoute will sample weather against.
 *
 * "Leave at" trips and transit "Arrive by" trips already have real
 * per-segment times on `route.segments` (see `lib/google/transform.ts`) —
 * used as-is. A non-transit "Arrive by" trip has none (WinterRoute doesn't
 * invent a recommended departure — see docs/architecture.md), so *for
 * weather sampling only* this derives:
 *
 *   nominalBaselineDepartureTime = tripDateTime - baselineDurationMinutes
 *
 * and re-runs the same segment-timing propagation used when building a
 * route from a Google result. This is explicitly NOT a recommendation —
 * `usedNominalBaseline` is set so callers can label it correctly (see
 * `RouteWeatherAnalysis.usedNominalBaselineTimeline`), and the original
 * `route.segments` are never mutated (a shallow clone is timed instead).
 */
export function resolveWeatherTimeline(
  route: Route,
  timePreference: TimePreference,
  tripDateTime: Date,
): WeatherTimeline {
  const alreadyTimed = route.segments.every((segment) => segment.startTime && segment.endTime);
  if (alreadyTimed) {
    return { segments: route.segments, usedNominalBaseline: false };
  }

  if (timePreference === "leaveAt") {
    const seeded = route.segments.map((segment) => ({ ...segment }));
    deriveSegmentTimes(seeded, tripDateTime);
    return { segments: seeded, usedNominalBaseline: false };
  }

  // Non-transit "Arrive by": no real schedule exists to anchor to.
  if (route.baselineDurationMinutes == null) {
    return { segments: route.segments, usedNominalBaseline: false };
  }

  const nominalBaselineDepartureTime = new Date(
    tripDateTime.getTime() - route.baselineDurationMinutes * 60_000,
  );
  const seeded = route.segments.map((segment) => ({ ...segment }));
  deriveSegmentTimes(seeded, nominalBaselineDepartureTime);
  return { segments: seeded, usedNominalBaseline: true };
}
