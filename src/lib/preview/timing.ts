import type { Route, RouteSegment } from "@/lib/route/types";
import type { PreviewSegmentSchedule } from "./types";

/** A nominal target — the actual total is then clamped into [MIN_TOTAL_MS, MAX_TOTAL_MS], so this is a starting point for the proportional split, not a promise. */
const TARGET_TOTAL_MS = 12000;
/** A 90-minute real commute must still preview in roughly this range — never scale up past it just because the route has many/long segments. */
const MAX_TOTAL_MS = 15000;
/** Even a single very short segment (e.g. a 2-minute walk) gets enough total time to actually be watched. */
const MIN_TOTAL_MS = 6000;
/** A tiny transfer segment (e.g. a 30-second walk between platforms) still gets enough on-screen time to register, before the overall-total rescale below. */
const MIN_SEGMENT_MS = 900;

function segmentWeight(segment: RouteSegment): number {
  if (segment.durationMinutes !== undefined && segment.durationMinutes > 0) return segment.durationMinutes;
  if (segment.distanceMeters !== undefined && segment.distanceMeters > 0) return segment.distanceMeters / 1000;
  return 1;
}

/**
 * Turns the route's REAL per-segment duration share into a COMPRESSED
 * preview timeline — e.g. a route that's mostly a 35-minute bus ride
 * gives the bus segment the largest slice of the preview, not an equal
 * share. Never uses real journey duration for playback timing. A
 * per-segment minimum (`MIN_SEGMENT_MS`) is enforced BEFORE the final
 * total is rescaled into `[MIN_TOTAL_MS, MAX_TOTAL_MS]`, so for a route
 * with many tiny segments the minimum is a soft floor (it can compress
 * slightly further during that final rescale) — a deliberate trade-off:
 * the hard cap on total preview length always wins, so nobody waits a
 * full minute to watch a 90-minute commute.
 */
export function buildPreviewSchedule(route: Route): PreviewSegmentSchedule[] {
  const segments = route.segments;
  if (segments.length === 0) return [];

  const weights = segments.map(segmentWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || segments.length;

  const flooredShares = weights.map((w) => Math.max(MIN_SEGMENT_MS, (w / totalWeight) * TARGET_TOTAL_MS));
  const rawTotal = flooredShares.reduce((a, b) => a + b, 0);
  const boundedTotal = Math.min(MAX_TOTAL_MS, Math.max(MIN_TOTAL_MS, rawTotal));
  const scale = rawTotal > 0 ? boundedTotal / rawTotal : 1;

  const schedule: PreviewSegmentSchedule[] = [];
  let cursor = 0;
  for (let i = 0; i < segments.length; i++) {
    const durationMs = flooredShares[i] * scale;
    const startMs = cursor;
    const endMs = cursor + durationMs;
    schedule.push({ segmentId: segments[i].id, mode: segments[i].mode, startMs, endMs });
    cursor = endMs;
  }
  return schedule;
}

export function totalPreviewDurationMs(schedule: PreviewSegmentSchedule[]): number {
  return schedule.length === 0 ? 0 : schedule[schedule.length - 1].endMs;
}
