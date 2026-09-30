import type { RouteSegment, SegmentTransportMode } from "./types";

const SEGMENT_MODE_LABELS: Record<SegmentTransportMode, string> = {
  walk: "Walk",
  cycle: "Cycle",
  drive: "Drive",
  bus: "Bus",
  rail: "Rail",
};

/** e.g. "Drive" for a single-segment route, or "Walk → Bus → Rail → Walk" for a multi-segment one. */
export function describeRouteModes(segments: RouteSegment[]): string {
  return segments.map((segment) => SEGMENT_MODE_LABELS[segment.mode]).join(" → ");
}

export function formatDurationMinutes(totalMinutes: number): string {
  const rounded = Math.max(0, Math.round(totalMinutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${String(minutes).padStart(2, "0")} min`;
}

export function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
