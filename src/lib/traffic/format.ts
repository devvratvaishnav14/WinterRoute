import type { TrafficInterval } from "./types";

export interface TrafficConditionBreakdown {
  normalPercent: number;
  slowPercent: number;
  trafficJamPercent: number;
}

/**
 * Route-proportion percentages by traffic condition, weighted by each
 * interval's real distance (see `lib/traffic/transform.ts` — computed
 * from actual polyline coordinates, not a point-count approximation).
 * Returns `null` when there's nothing to compute from (no intervals, or
 * zero total distance) — callers should omit the section entirely rather
 * than show a fabricated 0/0/0.
 */
export function computeConditionBreakdown(intervals: TrafficInterval[]): TrafficConditionBreakdown | null {
  const totalMeters = intervals.reduce((sum, interval) => sum + interval.distanceMeters, 0);
  if (totalMeters === 0) return null;

  const byCondition = { normal: 0, slow: 0, trafficJam: 0 };
  for (const interval of intervals) {
    byCondition[interval.condition] += interval.distanceMeters;
  }

  return {
    normalPercent: Math.round((byCondition.normal / totalMeters) * 100),
    slowPercent: Math.round((byCondition.slow / totalMeters) * 100),
    trafficJamPercent: Math.round((byCondition.trafficJam / totalMeters) * 100),
  };
}

export function formatTrafficDelay(minutes: number): string {
  if (minutes <= 0) return "No delay";
  return `+${minutes} min`;
}
