import type { CommuteFeatureSet } from "@/lib/scoring/types";
import type { DelayContribution, DurationTimingBasis } from "./types";

/** What grounded the central estimate — a plain descriptor for the dev-detail view, never a confidence percentage. */
export function determineTimingBasis(features: CommuteFeatureSet, contributions: DelayContribution[]): DurationTimingBasis {
  const hasCarTraffic = features.traffic.availability === "available";
  const hasTransitRealtime = contributions.some((c) => c.key === "transitRealtimeDelay");
  const hasTransitMatch = features.transit.availability === "available" || features.transit.availability === "not-yet-available";

  if (hasCarTraffic) return "traffic-aware";
  if (hasTransitRealtime) return "realtime-adjusted";
  if (hasTransitMatch) return "schedule-based";
  return "baseline-only";
}

/**
 * Contribution keys that are real (kept in `contributingDelayFactors`,
 * still widen `upperBoundMinutes`) but describe *how the estimate was
 * built* rather than *why this trip is different* — forecast-horizon
 * widening is the clearest example: it's present on nearly every
 * future trip, so surfacing it as a "reason" in normal user-facing text
 * reads as if the trip itself takes longer the farther out it is. It
 * stays fully visible in the dev-diagnostics view via the raw
 * `contributingDelayFactors` list — see `components/results/DetailsDrawer.tsx`.
 */
const NON_USER_FACING_CONTRIBUTION_KEYS = new Set<string>(["forecastHorizon"]);

/** Whether a contribution has a real, non-zero effect AND is meaningful to explain to an end user (as opposed to `NON_USER_FACING_CONTRIBUTION_KEYS`). */
export function isUserFacingDelayContribution(c: DelayContribution): boolean {
  return (c.centralMinutes !== 0 || c.upperMinutes !== 0) && !NON_USER_FACING_CONTRIBUTION_KEYS.has(c.key);
}

/**
 * Contribution keys that are real and user-facing, but describe
 * UNCERTAINTY/DATA COVERAGE rather than an actual disruption — e.g. "no
 * realtime update yet" doesn't mean the bus is late, it means WinterRoute
 * can't confirm either way yet. Kept separate from genuine disruption
 * reasons (traffic adding time, an active service alert, a road event,
 * notable weather) so a UI can distinguish "why this commute is
 * different" from "here's a caveat about the estimate" — see
 * `components/results/WhySection.tsx`'s three-way heading. A dynamic,
 * per-segment/per-alert key (e.g. `transitScheduleOnly-${segmentId}`)
 * still matches via its fixed prefix.
 */
const INFORMATIONAL_CONTRIBUTION_KEY_PREFIXES = ["transitScheduleOnly-", "carNoTrafficData"];

/** Whether a user-facing contribution is an uncertainty/data-coverage note rather than an actual disruption reason (see `INFORMATIONAL_CONTRIBUTION_KEY_PREFIXES`'s doc comment). A real active transit alert or road event counts as a genuine reason, even though its own minutes aren't quantified — it describes something actually happening, not just a gap in WinterRoute's data. */
export function isInformationalContribution(c: DelayContribution): boolean {
  return INFORMATIONAL_CONTRIBUTION_KEY_PREFIXES.some((prefix) => c.key.startsWith(prefix));
}

/**
 * Deterministic, template-generated sentences — no LLM, no randomized
 * prose. Only states what a contribution's own data actually supports;
 * skips contributions with no meaningful (non-zero) effect, ones that
 * aren't meant for the normal user-facing view (see
 * `isUserFacingDelayContribution`), and uncertainty/data-coverage notes
 * (see `buildDurationNotes` for those).
 */
export function buildDurationExplanation(contributions: DelayContribution[]): string[] {
  return contributions.filter((c) => isUserFacingDelayContribution(c) && !isInformationalContribution(c)).map((c) => c.explanation);
}

/** The uncertainty/data-coverage counterpart to `buildDurationExplanation` — see `isInformationalContribution`. */
export function buildDurationNotes(contributions: DelayContribution[]): string[] {
  return contributions.filter((c) => isUserFacingDelayContribution(c) && isInformationalContribution(c)).map((c) => c.explanation);
}
