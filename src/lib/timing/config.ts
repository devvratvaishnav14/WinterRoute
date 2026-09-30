/**
 * Centralized V0 timing-model constants — same discipline as
 * `lib/scoring/config.ts`/`lib/duration/config.ts`. Deliberately small:
 * this model's core logic is algorithmic (upper-bound departure, the
 * conservative typical-departure cap, floor-to-minute rounding), not a
 * set of heuristic thresholds — there is no "safety buffer" setting here
 * on purpose, per the explicit instruction not to add
 * Conservative/Balanced/Aggressive presets yet.
 */
export const timingModelV0Config = {
  modelVersion: "winterroute-timing-v0" as const,

  /**
   * How recent `ExpectedCommuteDurationV0.analyzedAt` must be, relative
   * to `now`, for a missed Arrive-By departure window's "leave now"
   * fallback arrival range to be considered still applicable. Beyond
   * this, the traffic-aware/realtime evidence embedded in the original
   * analysis may no longer reflect current conditions, and WinterRoute
   * refuses to reuse it rather than presenting stale timing as current —
   * see "Leave now fallback" in docs/decisions/0011-timing-recommendation-v0.md.
   */
  staleAnalysisToleranceMinutes: 15,
};

export type TimingModelV0Config = typeof timingModelV0Config;
