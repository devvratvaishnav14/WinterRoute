import type { CommuteFeatureSet } from "@/lib/scoring/types";

/**
 * WinterRoute's V0 expected-commute-duration model — a SEPARATE
 * prediction from `ExperimentalCommuteRiskV0`. The risk index answers
 * "how disruption-prone does this commute look" (a severity score); this
 * answers "given currently available evidence, how long should this
 * journey reasonably take" (a time range). Neither is derived from the
 * other — see `computeExpectedDuration.ts`'s doc comment and
 * docs/decisions/0010-duration-model-v0.md "Risk vs. duration: why two
 * models."
 *
 * Like the risk model, this is an interpretable V0 heuristic, not ML —
 * there is still no historical predicted-vs-actual outcome dataset large
 * enough to train or calibrate one.
 */

/**
 * Where one delay/uncertainty contribution's evidence came from — never
 * conflated. A Google traffic delay is not equivalent to a heuristic snow
 * allowance; a realtime TransLink delay is not equivalent to forecast
 * weather uncertainty.
 *
 * - `"observed-provider"`: a provider directly measured/reported this
 *   (Google traffic-aware delay, TransLink realtime delay).
 * - `"scheduled-provider"`: from a provider's own schedule, not a live
 *   measurement (GTFS static scheduled time, Google's baseline route).
 * - `"derived"`: computed by WinterRoute from factual inputs via plain
 *   arithmetic/timeline logic (e.g. the time shift from a recomputed
 *   missed-connection gap) — not invented, but not a raw provider value
 *   either.
 * - `"heuristic-v0"`: a WinterRoute V0 heuristic allowance, explicitly
 *   pending future calibration — never presented as a measurement.
 */
export type DelayProvenance = "observed-provider" | "scheduled-provider" | "derived" | "heuristic-v0";

/**
 * One named contributor to the duration estimate. Its effect is
 * expressed as three separate deltas (relative to the baseline
 * duration) rather than one number, specifically so a contribution can
 * widen uncertainty (`lowerMinutes`/`upperMinutes`) WITHOUT necessarily
 * shifting the central estimate (`centralMinutes`) — the walking/cycling
 * weather sections are explicit that most V0 heuristic effects belong in
 * the range, not the point estimate. `lowerMinutes <= centralMinutes <=
 * upperMinutes` always holds for a single contribution (enforced by the
 * builder functions, not by this type).
 */
export interface DelayContribution {
  key: string;
  label: string;
  centralMinutes: number;
  lowerMinutes: number;
  upperMinutes: number;
  provenance: DelayProvenance;
  explanation: string;
  /** Which mode/segment scope this applies to — a mode name, or `"route"` for a whole-trip effect (e.g. forecast-horizon widening). */
  appliesTo: string;
}

/**
 * Duration-specific prediction availability — deliberately separate from
 * `RiskPredictionStatus`, since the requirements differ (weather may be
 * essential to a walking RISK score, but a crude duration estimate can
 * still come from baseline routing alone even without it).
 *
 * - `"available"`: a normal, defensible estimate.
 * - `"limited-data"`: some applicable timing evidence is missing, but an
 *   estimate is still possible.
 * - `"insufficient-data"`: no usable timing basis at all (no baseline
 *   duration to start from).
 * - `"route-disrupted"`: the itinerary AS PLANNED can't be completed —
 *   a matched transit leg is canceled, or realtime evidence shows a
 *   connection has been missed and WinterRoute can't determine a
 *   defensible alternative from currently available data. A range is
 *   still returned (best-effort, deliberately wide), but should never be
 *   read as precise.
 */
export type DurationPredictionStatus = "available" | "limited-data" | "insufficient-data" | "route-disrupted";

export interface DurationDataCoverage {
  traffic: "complete" | "partial" | "not-applicable" | "unavailable";
  weather: "complete" | "partial" | "unavailable";
  transit: "realtime" | "scheduled-only" | "partial" | "not-applicable" | "unavailable";
  roadEvents: "checked" | "unavailable";
}

/**
 * What grounded the central estimate, for the dev-detail view — a plain
 * descriptor, never a confidence percentage.
 */
export type DurationTimingBasis = "traffic-aware" | "realtime-adjusted" | "schedule-based" | "baseline-only";

export interface DurationSourceFreshness {
  weatherModelsAvailable: number;
  trafficRecency?: "near-term" | "future";
  transitRecency: "near-term" | "future" | "not-applicable";
}

/**
 * WinterRoute's V0 expected-commute-duration output.
 *
 * `centralEstimateMinutes` is the single best-guess point; the real
 * output is the RANGE (`lowerBoundMinutes`-`upperBoundMinutes`), which is
 * deliberately allowed to be asymmetric (see `combine.ts`) — commute
 * delay distributions skew upward (things run late far more often than
 * they run dramatically early), and forcing a symmetric ± band around
 * the center would be a fabricated precision this model doesn't have.
 *
 * `directlyObservedDelayMinutes` is clamped to be non-negative for
 * display (never "-4 min delay") — the underlying, unclamped
 * relationship between `centralEstimateMinutes` and
 * `baselineDurationMinutes` is still fully preserved and can legitimately
 * show a faster-than-baseline central estimate when real traffic
 * evidence supports it. See docs/decisions/0010-duration-model-v0.md
 * "No negative commute — what's clamped and what isn't."
 */
export interface ExpectedCommuteDurationV0 {
  modelVersion: "winterroute-duration-v0";
  configFingerprint: string;
  analyzedAt: Date;
  baselineDurationMinutes: number;
  centralEstimateMinutes: number;
  lowerBoundMinutes: number;
  upperBoundMinutes: number;
  /** Non-negative for display — see doc comment above. */
  directlyObservedDelayMinutes: number;
  /** Sum of heuristic-v0 contributions' effect on the CENTRAL estimate only (usually 0 — see walking/cycling sections). */
  modeledAdditionalDelayMinutes: number;
  uncertaintyBufferMinutes: { lower: number; upper: number };
  predictionStatus: DurationPredictionStatus;
  statusReasons: string[];
  dataCoverage: DurationDataCoverage;
  contributingDelayFactors: DelayContribution[];
  /** Genuinely meaningful, user-facing DISRUPTION/DELAY reasons only (e.g. traffic adding time, snow affecting the route, a road event) — see `isUserFacingDelayContribution`/`isInformationalContribution` in `explanation.ts`. */
  explanation: string[];
  /** User-facing INFORMATION/UNCERTAINTY notes (e.g. "no realtime update yet", "no traffic data available") — real and worth showing, but never implies a delay on its own. Kept separate from `explanation` so a UI can head "Why this commute is different" only when a genuine reason exists. */
  notes: string[];
  timingBasis: DurationTimingBasis;
  sourceFreshness: DurationSourceFreshness;
  /** Preserved for the dev-detail view and future calibration — the same engineered features the risk model used, not raw provider data. */
  features: CommuteFeatureSet;
}
