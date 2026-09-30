import { isInformationalContribution, isUserFacingDelayContribution } from "@/lib/duration/explanation";
import { formatDurationRange } from "@/lib/duration/format";
import type { DelayContribution, ExpectedCommuteDurationV0 } from "@/lib/duration/types";
import { formatTimeRange, formatTripTime } from "@/lib/trip/format";
import type { ArriveByTimingResult, LeaveAtTimingResult } from "./types";

export interface TimingExplanation {
  /** A factual restatement of the recommendation/arrival itself — see `CommuteTimingRecommendationV0.summarySentences`'s doc comment. */
  summarySentences: string[];
  /** Genuinely meaningful (non-zero, user-facing) DISRUPTION reasons this trip differs from usual — see `CommuteTimingRecommendationV0.explanation`'s doc comment. */
  reasons: string[];
  /** Uncertainty/data-coverage notes — real, but never implying a delay on their own. See `CommuteTimingRecommendationV0.notes`'s doc comment. */
  notes: string[];
}

function dominantExplanations(contributions: DelayContribution[], predicate: (c: DelayContribution) => boolean, maxCount: number): string[] {
  return contributions
    .filter((c) => isUserFacingDelayContribution(c) && predicate(c))
    .sort((a, b) => b.upperMinutes - a.upperMinutes)
    .slice(0, maxCount)
    .map((c) => c.explanation);
}

/** The dominant (at most 2 each) disruption reasons and uncertainty notes from the duration model's own contributions — reuses their OWN already-written explanation sentences rather than re-deriving new text, so the two previews never disagree about why. */
function dominantDurationExplanations(duration: ExpectedCommuteDurationV0, maxCount = 2): { reasons: string[]; notes: string[] } {
  return {
    reasons: dominantExplanations(duration.contributingDelayFactors, (c) => !isInformationalContribution(c), maxCount),
    notes: dominantExplanations(duration.contributingDelayFactors, isInformationalContribution, maxCount),
  };
}

/** Deterministic sentences for an Arrive-By recommendation — never inferred from the risk index. */
export function buildArriveByExplanation(duration: ExpectedCommuteDurationV0, result: ArriveByTimingResult): TimingExplanation {
  const summarySentences: string[] = [
    `Your trip normally takes about ${Math.round(duration.baselineDurationMinutes)} min. Current conditions produce an expected range of ${formatDurationRange(duration.lowerBoundMinutes, duration.upperBoundMinutes)}.`,
  ];

  if (result.recommendedDepartureTime) {
    if ((result.leaveEarlierByMinutes ?? 0) > 0) {
      summarySentences.push(`Leaving by about ${formatTripTime(result.recommendedDepartureTime)} allows for the upper end of that estimate.`);
    } else {
      summarySentences.push("Your usual departure timing should be sufficient based on current conditions.");
    }
  }

  return { summarySentences, ...dominantDurationExplanations(duration) };
}

/** Deterministic sentences for a Leave-At expected-arrival range. */
export function buildLeaveAtExplanation(duration: ExpectedCommuteDurationV0, result: LeaveAtTimingResult): TimingExplanation {
  const summarySentences: string[] = [];

  if (result.expectedArrivalLower && result.expectedArrivalUpper) {
    const collapsed = formatTripTime(result.expectedArrivalLower) === formatTripTime(result.expectedArrivalUpper);
    summarySentences.push(
      collapsed
        ? `Based on current conditions, you're expected to arrive around ${formatTripTime(result.expectedArrivalLower)}.`
        : `Based on current conditions, you're expected to arrive between ${formatTimeRange(result.expectedArrivalLower, result.expectedArrivalUpper)}.`,
    );
  }

  return { summarySentences, ...dominantDurationExplanations(duration) };
}
