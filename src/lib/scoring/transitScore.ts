import { riskModelV0Config, scoreOnCurve } from "./config";
import { pluralize } from "./pluralize";
import type { CommuteFeatureSet, FactorContribution, FactorScore } from "./types";

/**
 * TransitDisruptionScore — `"not-applicable"` for a route with no
 * `bus`/`rail` segments, `"unavailable"` when TransLink's data couldn't
 * be fetched at all. When `"scored"`, combines (each as its own
 * transparent contribution, never hidden inside a single opaque number):
 *
 * - Delay, from the MEDIAN observed delay across realtime-confirmed
 *   segments only — schedule-only segments (no realtime published yet)
 *   never contribute a delay value, since "no update" is not "0 delay."
 * - A cancellation floor: per the project brief, "a factual canceled
 *   matched transit trip is a major disruption signal... the score may
 *   reflect this strongly" — implemented as `max(combinedScore,
 *   canceledTripScore)` when any matched segment is canceled, rather than
 *   letting it be diluted by an unrelated delay/alert average.
 * - Skipped stops and relevant alert effects (mapped through a
 *   centrally-configured severity table — no TransLink-published
 *   severity scale exists, so this is an explicit V0 heuristic).
 */
export function scoreTransitFactor(features: CommuteFeatureSet): FactorScore {
  const transit = features.transit;

  if (transit.availability === "not-applicable") {
    return {
      factor: "transit",
      status: "not-applicable",
      reason: "This trip has no bus or rail segments.",
      contributions: [],
    };
  }

  if (transit.transitSegmentCount === 0) {
    return {
      factor: "transit",
      status: "unavailable",
      reason: "Transit data was unavailable for this trip.",
      contributions: [],
    };
  }

  const { delayCurve, canceledTripScore, skippedStopScore, alertEffectSeverity } = riskModelV0Config.transit;
  const contributions: FactorContribution[] = [];
  let combined = 0;

  if (transit.medianDelaySecondsAcrossRealtimeSegments !== undefined) {
    const minutes = transit.medianDelaySecondsAcrossRealtimeSegments / 60;
    const delayScore = scoreOnCurve(minutes, delayCurve);
    contributions.push({
      key: "delay",
      label: "Transit delay",
      rawValue: delayScore,
      weight: 1,
      detail: `median observed delay ${minutes.toFixed(1)} min across ${transit.realtimeMatchedSegmentCount} realtime-confirmed ${pluralize(transit.realtimeMatchedSegmentCount, "segment")}`,
    });
    combined = Math.max(combined, delayScore);
  }

  if (transit.skippedStopSegmentCount > 0) {
    contributions.push({
      key: "skippedStop",
      label: "Skipped stop",
      rawValue: skippedStopScore,
      weight: 1,
      detail: `${transit.skippedStopSegmentCount} ${pluralize(transit.skippedStopSegmentCount, "segment")} reported a skipped stop`,
    });
    combined = Math.max(combined, skippedStopScore);
  }

  if (transit.relevantAlertEffects.length > 0) {
    const worstEffectSeverity = Math.max(...transit.relevantAlertEffects.map((effect) => alertEffectSeverity[effect]));
    contributions.push({
      key: "alert",
      label: "Service alert",
      rawValue: worstEffectSeverity,
      weight: 1,
      detail: `${transit.relevantSegmentAlertCount + transit.relevantSystemAlertCount} relevant ${pluralize(transit.relevantSegmentAlertCount + transit.relevantSystemAlertCount, "alert")}: ${transit.relevantAlertEffects.join(", ")}`,
    });
    combined = Math.max(combined, worstEffectSeverity);
  }

  if (transit.canceledSegmentCount > 0) {
    contributions.push({
      key: "canceled",
      label: "Canceled trip",
      rawValue: canceledTripScore,
      weight: 1,
      detail: `${transit.canceledSegmentCount} matched ${pluralize(transit.canceledSegmentCount, "segment")} reported canceled`,
    });
    // A cancellation is a major disruption signal in its own right — never let it be diluted below its own floor by averaging with an unrelated minor delay/alert.
    combined = Math.max(combined, canceledTripScore);
  }

  return { factor: "transit", status: "scored", score: Math.round(Math.min(100, combined)), contributions };
}
