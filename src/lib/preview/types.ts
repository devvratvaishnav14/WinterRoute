import type { SegmentTransportMode } from "@/lib/route/types";

/**
 * "Preview my commute" — a compressed, purely VISUAL animation of the
 * traveler moving along the route's own already-computed geometry. No
 * new routing/transit request, and never read or written by any
 * analytical model (risk/duration/timing/weather). See
 * docs/architecture.md "Preview My Commute architecture".
 */

export type PreviewStatus = "idle" | "playing" | "paused" | "complete";

export interface PreviewPoint {
  latitude: number;
  longitude: number;
}

/** One segment's allocated slice of the COMPRESSED preview timeline (milliseconds), proportional to its share of the real route duration — never the real segment duration. */
export interface PreviewSegmentSchedule {
  segmentId: string;
  mode: SegmentTransportMode;
  startMs: number;
  endMs: number;
}

/** The moving marker's state at one instant of the compressed preview timeline. */
export interface PreviewFrame {
  segmentId: string;
  mode: SegmentTransportMode;
  position: PreviewPoint;
  /** 0-1 across the WHOLE preview, not just the current segment. */
  overallProgress: number;
}
