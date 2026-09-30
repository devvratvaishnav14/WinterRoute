import type { Route, RouteSegment } from "@/lib/route/types";
import { pointAtFraction } from "./geometry";
import type { PreviewFrame, PreviewPoint, PreviewSegmentSchedule } from "./types";

/** The real route geometry for a segment — falls back to a straight `[start, end]` line, exactly like `components/map/routeMapGeometry.ts`'s `segmentPath`, when the provider didn't supply real road geometry. Kept as its own small pure function (rather than importing that Google-Maps-shaped one) since this module must stay framework/provider-agnostic. */
export function segmentGeometryPoints(segment: RouteSegment): PreviewPoint[] {
  if (segment.geometry && segment.geometry.length > 0) return segment.geometry;
  return [segment.start, segment.end];
}

/**
 * The single pure function driving "Preview my commute" — given the
 * route, its compressed schedule, and an elapsed time into that
 * schedule, returns exactly where the marker is and what mode it should
 * render as. No side effects, no timers — the animation loop (see
 * `usePreviewPlayback.ts`) is a thin wrapper that calls this every tick.
 */
export function frameAtElapsedMs(route: Route, schedule: PreviewSegmentSchedule[], elapsedMs: number): PreviewFrame | null {
  if (schedule.length === 0) return null;

  const totalMs = schedule[schedule.length - 1].endMs;
  const clampedMs = Math.max(0, Math.min(totalMs, elapsedMs));

  // The LAST schedule entry whose startMs <= clampedMs — so exactly at a
  // segment boundary, the NEXT segment is already considered active
  // (the marker has "reached the boarding point and transitioned").
  let activeIndex = 0;
  for (let i = 0; i < schedule.length; i++) {
    if (clampedMs >= schedule[i].startMs) activeIndex = i;
  }
  const active = schedule[activeIndex];
  const segment = route.segments.find((s) => s.id === active.segmentId);
  if (!segment) return null;

  const segmentDurationMs = active.endMs - active.startMs;
  const segmentFraction = segmentDurationMs <= 0 ? 1 : (clampedMs - active.startMs) / segmentDurationMs;
  const points = segmentGeometryPoints(segment);
  const position = pointAtFraction(points, segmentFraction);

  return {
    segmentId: active.segmentId,
    mode: active.mode,
    position,
    overallProgress: totalMs <= 0 ? 1 : clampedMs / totalMs,
  };
}
