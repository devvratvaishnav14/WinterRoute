import type { RouteSegment } from "@/lib/route/types";
import { pointAtFractionAlongPath, type LatLng } from "@/lib/geo/geometry";
import type { RouteWeatherSamplePoint } from "./types";

/**
 * Upper bound on how many weather sample points a single analysis will
 * ever request — controls API usage regardless of route length. Not a
 * target; see `TARGET_SAMPLE_POINTS`.
 */
export const MAX_SAMPLE_POINTS = 10;

/**
 * The number of samples a typical Metro Vancouver commute should land
 * near (per the project brief: "5-8 useful weather sample points"). Short
 * routes naturally produce fewer (see the boundary-only fallback below);
 * long/multi-segment routes are capped at `MAX_SAMPLE_POINTS`.
 */
export const TARGET_SAMPLE_POINTS = 7;

/**
 * A segment shorter than this doesn't get intermediate samples — only its
 * boundary points. Avoids spending sample budget on, e.g., a 5-minute walk
 * to a bus stop, where conditions won't meaningfully vary internally.
 */
export const MIN_SEGMENT_DISTANCE_FOR_INTERMEDIATE_SAMPLES_METERS = 3000;

interface BoundaryDraft {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  estimatedTime: Date | undefined;
  segmentId?: string;
}

function segmentPath(segment: RouteSegment): LatLng[] {
  if (segment.geometry && segment.geometry.length >= 2) return segment.geometry;
  return [segment.start, segment.end];
}

function interpolateTime(start: Date | undefined, end: Date | undefined, fraction: number): Date | undefined {
  if (!start || !end) return undefined;
  return new Date(start.getTime() + (end.getTime() - start.getTime()) * fraction);
}

/** Largest-remainder allocation of `budget` intermediate points across segments, weighted by distance. */
function allocateIntermediateCounts(segments: RouteSegment[], budget: number): number[] {
  if (segments.length === 0 || budget <= 0) return segments.map(() => 0);

  const distances = segments.map((s) => s.distanceMeters ?? 0);
  const total = distances.reduce((sum, d) => sum + d, 0);
  if (total === 0) return segments.map(() => 0);

  const raw = distances.map((d) => (budget * d) / total);
  const counts = raw.map(Math.floor);
  let allocated = counts.reduce((sum, c) => sum + c, 0);

  const remainders = raw
    .map((value, index) => ({ index, fraction: value - counts[index] }))
    .sort((a, b) => b.fraction - a.fraction);

  let i = 0;
  while (allocated < budget && i < remainders.length) {
    counts[remainders[i].index] += 1;
    allocated += 1;
    i += 1;
  }

  return counts;
}

/** Every unique segment boundary (origin, each transition, destination), in route order, with whatever time is directly available on that segment. */
function buildBoundaryDrafts(segments: RouteSegment[]): BoundaryDraft[] {
  const drafts: BoundaryDraft[] = [];

  segments.forEach((segment, index) => {
    if (index === 0) {
      drafts.push({
        id: "boundary-0",
        latitude: segment.start.latitude,
        longitude: segment.start.longitude,
        label: segment.start.label,
        estimatedTime: segment.startTime,
        segmentId: segment.id,
      });
    }

    drafts.push({
      id: `boundary-${index + 1}`,
      latitude: segment.end.latitude,
      longitude: segment.end.longitude,
      label: segment.end.label,
      estimatedTime: segment.endTime,
      segmentId: index === segments.length - 1 ? undefined : segment.id,
    });
  });

  return drafts;
}

/**
 * Builds the set of route/time points WinterRoute samples weather at.
 *
 * Always includes every segment boundary (origin, each mode/transfer
 * transition, destination) — these are never dropped, since they're
 * exactly the meaningful geographic transitions the project cares about
 * (e.g. leaving Burnaby Mountain for a SkyTrain corridor). Remaining
 * budget (up to `TARGET_SAMPLE_POINTS`, never exceeding
 * `MAX_SAMPLE_POINTS`) is distributed across segments longer than
 * `MIN_SEGMENT_DISTANCE_FOR_INTERMEDIATE_SAMPLES_METERS`, proportional to
 * their distance, placed along the segment's real geometry (falling back
 * to a straight line when geometry isn't available) with times linearly
 * interpolated between the segment's own start/end times.
 *
 * Requires `segments` to already be timed (see
 * `lib/weather/timeline.ts`) to produce timed samples — a boundary whose
 * segment has no derivable time is dropped rather than shipped with an
 * undefined time, and its segment contributes no intermediate samples
 * (there's no time to interpolate against).
 */
export function buildRouteWeatherSamples(segments: RouteSegment[]): RouteWeatherSamplePoint[] {
  if (segments.length === 0) return [];

  const boundaryDrafts = buildBoundaryDrafts(segments);
  const timedBoundaryCount = boundaryDrafts.filter((b) => b.estimatedTime instanceof Date).length;

  const remainingBudget = Math.max(
    0,
    Math.min(TARGET_SAMPLE_POINTS, MAX_SAMPLE_POINTS) - timedBoundaryCount,
  );

  const qualifyingSegments = segments.filter(
    (s) =>
      (s.distanceMeters ?? 0) >= MIN_SEGMENT_DISTANCE_FOR_INTERMEDIATE_SAMPLES_METERS &&
      s.startTime &&
      s.endTime,
  );
  const counts = allocateIntermediateCounts(qualifyingSegments, remainingBudget);

  const intermediatesBySegment = new Map<string, RouteWeatherSamplePoint[]>();
  qualifyingSegments.forEach((segment, qualifyingIndex) => {
    const count = counts[qualifyingIndex];
    if (count === 0) return;
    const path = segmentPath(segment);
    const points: RouteWeatherSamplePoint[] = [];
    for (let i = 1; i <= count; i++) {
      const fraction = i / (count + 1);
      const time = interpolateTime(segment.startTime, segment.endTime, fraction);
      if (!time) continue;
      const coordinate = pointAtFractionAlongPath(path, fraction);
      points.push({
        id: `${segment.id}-mid-${i}`,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        label: "En route",
        estimatedTime: time,
        segmentId: segment.id,
      });
    }
    intermediatesBySegment.set(segment.id, points);
  });

  // Assemble in route order: each segment's boundary points interleaved
  // with its own intermediate samples.
  const ordered: RouteWeatherSamplePoint[] = [];
  const draftsById = new Map(boundaryDrafts.map((d) => [d.id, d]));

  function pushBoundary(id: string) {
    const draft = draftsById.get(id);
    if (draft && draft.estimatedTime instanceof Date) {
      ordered.push({
        id: draft.id,
        latitude: draft.latitude,
        longitude: draft.longitude,
        label: draft.label,
        estimatedTime: draft.estimatedTime,
        segmentId: draft.segmentId,
      });
    }
  }

  segments.forEach((segment, index) => {
    if (index === 0) pushBoundary("boundary-0");
    for (const mid of intermediatesBySegment.get(segment.id) ?? []) {
      ordered.push(mid);
    }
    pushBoundary(`boundary-${index + 1}`);
  });

  return ordered.slice(0, MAX_SAMPLE_POINTS);
}
