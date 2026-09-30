import type { PreviewPoint } from "./types";

const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineMeters(a: PreviewPoint, b: PreviewPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance (meters) at each point, starting at 0 for the first point — `distances.length === points.length`. */
export function cumulativeDistances(points: PreviewPoint[]): number[] {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + haversineMeters(points[i - 1], points[i]));
  }
  return distances;
}

/**
 * The point `fraction` (0-1) of the way along a polyline BY DISTANCE,
 * not by point-index — a real road-geometry polyline often has far more
 * points on curves than on straightaways, so index-based interpolation
 * would make the marker visibly speed up and slow down for no reason.
 * Degenerate input (0 or 1 points, or every point identical) falls back
 * to the first point rather than throwing.
 */
export function pointAtFraction(points: PreviewPoint[], fraction: number): PreviewPoint {
  if (points.length === 0) return { latitude: 0, longitude: 0 };
  if (points.length === 1) return points[0];

  const clamped = Math.max(0, Math.min(1, fraction));
  const distances = cumulativeDistances(points);
  const total = distances[distances.length - 1];
  if (total <= 0) return points[0];

  const target = clamped * total;
  for (let i = 1; i < distances.length; i++) {
    if (target <= distances[i]) {
      const segStart = distances[i - 1];
      const segLength = distances[i] - segStart;
      const t = segLength <= 0 ? 0 : (target - segStart) / segLength;
      return {
        latitude: points[i - 1].latitude + (points[i].latitude - points[i - 1].latitude) * t,
        longitude: points[i - 1].longitude + (points[i].longitude - points[i - 1].longitude) * t,
      };
    }
  }
  return points[points.length - 1];
}
