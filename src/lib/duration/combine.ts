import type { DelayContribution } from "./types";

export interface CombinedRange {
  centralEstimateMinutes: number;
  lowerBoundMinutes: number;
  upperBoundMinutes: number;
}

/**
 * Sums each contribution's three deltas against the baseline, then
 * enforces the range invariants unconditionally: `lowerBound >= 0`,
 * `lowerBound <= centralEstimate <= upperBound`. A contribution's
 * `centralMinutes` CAN be negative (see `carDuration.ts` — a
 * traffic-aware duration genuinely faster than baseline produces a
 * negative delta), so the final clamp only floors the sum at 0, it never
 * forces it upward — that's what lets the central estimate legitimately
 * land below a static baseline reference when real evidence supports it.
 */
export function combineContributions(baselineMinutes: number, contributions: DelayContribution[]): CombinedRange {
  const centralDelta = contributions.reduce((sum, c) => sum + c.centralMinutes, 0);
  const lowerDelta = contributions.reduce((sum, c) => sum + c.lowerMinutes, 0);
  const upperDelta = contributions.reduce((sum, c) => sum + c.upperMinutes, 0);

  const centralEstimateMinutes = Math.max(0, baselineMinutes + centralDelta);
  let lowerBoundMinutes = Math.max(0, baselineMinutes + lowerDelta);
  let upperBoundMinutes = Math.max(0, baselineMinutes + upperDelta);

  lowerBoundMinutes = Math.min(lowerBoundMinutes, centralEstimateMinutes);
  upperBoundMinutes = Math.max(upperBoundMinutes, centralEstimateMinutes);

  return { centralEstimateMinutes, lowerBoundMinutes, upperBoundMinutes };
}

/** Non-negative for display — see `types.ts`'s doc comment on `ExpectedCommuteDurationV0.directlyObservedDelayMinutes`. */
export function directlyObservedDelayMinutes(contributions: DelayContribution[]): number {
  const observed = contributions
    .filter((c) => c.provenance === "observed-provider" || c.provenance === "derived")
    .reduce((sum, c) => sum + c.centralMinutes, 0);
  return Math.max(0, observed);
}

export function modeledAdditionalDelayMinutes(contributions: DelayContribution[]): number {
  return contributions.filter((c) => c.provenance === "heuristic-v0").reduce((sum, c) => sum + c.centralMinutes, 0);
}
