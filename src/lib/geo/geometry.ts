export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in metres. */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lerp(a: LatLng, b: LatLng, fraction: number): LatLng {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * fraction,
    longitude: a.longitude + (b.longitude - a.longitude) * fraction,
  };
}

/**
 * The point at `fraction` (0–1) of the way along `path`, measured by
 * cumulative distance (not by array index — path points are rarely evenly
 * spaced). Falls back to a straight line between the first and last point
 * when there's no usable path. Used to sample weather along a route's real
 * geometry rather than cutting straight across it.
 */
export function pointAtFractionAlongPath(path: LatLng[], fraction: number): LatLng {
  const clamped = Math.max(0, Math.min(1, fraction));

  if (path.length === 0) {
    throw new Error("pointAtFractionAlongPath: path must have at least one point");
  }
  if (path.length === 1) return path[0];

  const segmentLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const length = haversineDistanceMeters(path[i - 1], path[i]);
    segmentLengths.push(length);
    total += length;
  }

  if (total === 0) return path[0];

  const target = total * clamped;
  let cumulative = 0;
  for (let i = 0; i < segmentLengths.length; i++) {
    const length = segmentLengths[i];
    if (cumulative + length >= target) {
      const localFraction = length === 0 ? 0 : (target - cumulative) / length;
      return lerp(path[i], path[i + 1], localFraction);
    }
    cumulative += length;
  }

  return path[path.length - 1];
}
