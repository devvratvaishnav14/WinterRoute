import type { DurationDataCoverage, DurationPredictionStatus } from "@/lib/duration/types";
import type { TimePreference } from "@/lib/trip/types";

/**
 * WinterRoute's V0 timing-recommendation model — converts
 * `ExpectedCommuteDurationV0` into an action ("leave by X" for Arrive By,
 * "expect to arrive Y-Z" for Leave At). Derived from duration-v0 but
 * versioned independently (`"winterroute-timing-v0"`), since its own
 * decision rules — the conservative typical-departure cap, missed-window
 * handling — may evolve separately from the duration model's timing
 * arithmetic. Never reads the risk index; see
 * docs/decisions/0011-timing-recommendation-v0.md "Why the risk index
 * cannot affect timing."
 */

/**
 * - `"available"`: a normal, defensible recommendation/arrival range.
 * - `"limited-data"`: propagated from `ExpectedCommuteDurationV0` —
 *   the underlying duration range still exists and is used, but the
 *   evidence behind it is incomplete.
 * - `"insufficient-data"`: the duration model itself couldn't produce a
 *   usable range — no recommendation/arrival range is returned.
 * - `"route-disrupted"`: propagated from the duration model — the
 *   itinerary as planned may not be completable, so no confident
 *   recommendation is given.
 * - `"departure-window-missed"`: ARRIVE BY only — the recommended
 *   departure time has already passed relative to `now`. Takes priority
 *   over `"limited-data"`/`"available"` in the reported status (the
 *   underlying data quality is still noted in `statusReasons`).
 */
export type TimingRecommendationStatus =
  | "available"
  | "limited-data"
  | "insufficient-data"
  | "route-disrupted"
  | "departure-window-missed";

export interface TimingArrivalWindow {
  lower: Date;
  central: Date;
  upper: Date;
}

export interface ArriveByTimingResult {
  targetArrivalTime: Date;
  /** `targetArrivalTime - baselineDurationMinutes`, floored to the minute. */
  typicalDepartureTime?: Date;
  /**
   * The final "leave by" time — `min(targetArrivalTime - upperBoundMinutes,
   * typicalDepartureTime)`, floored to the minute. Never later than
   * `typicalDepartureTime` — see the conservative cap rule in
   * docs/decisions/0011-timing-recommendation-v0.md.
   */
  recommendedDepartureTime?: Date;
  /** `typicalDepartureTime - recommendedDepartureTime`, in whole minutes — always >= 0 given the cap. */
  leaveEarlierByMinutes?: number;
  /** The arrival range that results from actually leaving at `recommendedDepartureTime` — may differ from `targetArrivalTime` when the cap applied. */
  expectedArrivalWindowWhenLeavingRecommended?: TimingArrivalWindow;
  /** Only present when `status === "departure-window-missed"` AND the original analysis is still recent enough to be treated as applicable to "leaving now" — see `staleAnalysisToleranceMinutes`. */
  leaveNowExpectedArrivalRange?: TimingArrivalWindow;
  /** True when `leaveNowExpectedArrivalRange` was deliberately withheld because the underlying analysis is stale relative to `now`. */
  leaveNowAnalysisStale?: boolean;
}

export interface LeaveAtTimingResult {
  selectedDepartureTime: Date;
  /** `selectedDepartureTime + baselineDurationMinutes` — for the "typical vs. expected" comparison only, never shown as a recommendation. */
  typicalArrivalTime?: Date;
  expectedArrivalLower?: Date;
  expectedArrivalCentral?: Date;
  expectedArrivalUpper?: Date;
  /** How much later (positive) or earlier (negative) the expected arrival bounds are versus the typical arrival, in whole minutes. */
  arrivalDifferenceFromTypicalMinutes?: { lower: number; upper: number };
}

/** A trimmed reference to the duration prediction this was derived from — never the full `ExpectedCommuteDurationV0` object (see `types.ts`'s doc comment on why). */
export interface DurationPredictionReference {
  modelVersion: string;
  configFingerprint: string;
  predictionStatus: DurationPredictionStatus;
  baselineDurationMinutes: number;
  centralEstimateMinutes: number;
  lowerBoundMinutes: number;
  upperBoundMinutes: number;
}

export interface CommuteTimingRecommendationV0 {
  modelVersion: "winterroute-timing-v0";
  configFingerprint: string;
  analyzedAt: Date;
  preference: TimePreference;
  status: TimingRecommendationStatus;
  statusReasons: string[];
  arriveBy?: ArriveByTimingResult;
  leaveAt?: LeaveAtTimingResult;
  /**
   * A factual restatement of the recommendation/arrival itself (e.g.
   * "Based on current conditions, you're expected to arrive around
   * 10:14 AM.") — always at most a sentence or two, never empty unless
   * `arriveBy`/`leaveAt` itself is empty. Kept separate from
   * `explanation` so a UI can tell "here's what happens" apart from
   * "here's why it's different from usual" (`explanation`) without
   * parsing sentence text.
   */
  summarySentences: string[];
  /** Deterministic, template-generated sentences — built from the duration model's own contribution data, never the risk index. Only genuinely meaningful, non-zero, user-facing DISRUPTION reasons (traffic adding time, an active service alert, a road event, notable weather) — an empty array means nothing notable is affecting this trip, not that nothing was checked. Never includes uncertainty/data-coverage notes — see `notes`. */
  explanation: string[];
  /** Uncertainty/data-coverage notes (e.g. "no realtime update yet") — real and worth surfacing, but distinct from `explanation`'s disruption reasons since a missing update never implies a delay on its own. See `components/results/WhySection.tsx`'s three-way heading ("Why this commute is different" / "What to know" / "At a glance"). */
  notes: string[];
  dataCoverage: DurationDataCoverage;
  durationPredictionReference: DurationPredictionReference;
}
