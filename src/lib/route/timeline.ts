import type { RouteSegment } from "./types";

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Fills in `startTime`/`endTime` for segments that don't already have them,
 * by propagating from whatever *is* known — a transit neighbor's real
 * schedule time, or a known starting instant.
 *
 * Two passes: forward (known start + duration -> end; end -> next segment's
 * start), then backward (known end + duration -> start; start -> previous
 * segment's end). Mutates and returns `segments`.
 *
 * Generic route-timing logic — used both when building a `Route` from a
 * Google Routes result (`lib/google/transform.ts`) and when deriving a
 * weather-sampling timeline for a non-transit "Arrive by" trip
 * (`lib/weather/timeline.ts`), which has no real departure time to seed
 * with and instead seeds a clearly-labeled nominal one. See the
 * `knownStartTime` doc note at each call site for what's safe to pass.
 */
export function deriveSegmentTimes(segments: RouteSegment[], knownStartTime?: Date): RouteSegment[] {
  if (knownStartTime && segments.length > 0 && !segments[0].startTime) {
    segments[0].startTime = knownStartTime;
  }

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.startTime && !segment.endTime && segment.durationMinutes != null) {
      segment.endTime = addMinutes(segment.startTime, segment.durationMinutes);
    }
    const next = segments[i + 1];
    if (segment.endTime && next && !next.startTime) {
      next.startTime = segment.endTime;
    }
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (segment.endTime && !segment.startTime && segment.durationMinutes != null) {
      segment.startTime = addMinutes(segment.endTime, -segment.durationMinutes);
    }
    const prev = segments[i - 1];
    if (segment.startTime && prev && !prev.endTime) {
      prev.endTime = segment.startTime;
    }
  }

  return segments;
}
