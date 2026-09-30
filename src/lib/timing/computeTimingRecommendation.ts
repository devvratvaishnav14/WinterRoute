import type { ExpectedCommuteDurationV0 } from "@/lib/duration/types";
import type { TimePreference } from "@/lib/trip/types";
import { computeArriveBy } from "./arriveBy";
import { timingModelV0Config } from "./config";
import { computeTimingConfigFingerprint } from "./configFingerprint";
import { buildArriveByExplanation, buildLeaveAtExplanation } from "./explanation";
import { computeLeaveAt } from "./leaveAt";
import type { CommuteTimingRecommendationV0, DurationPredictionReference } from "./types";

export interface ComputeTimingRecommendationInput {
  duration: ExpectedCommuteDurationV0;
  preference: TimePreference;
  /** The user's selected arrival target (Arrive By) or departure time (Leave At) — the same value as `TripRequest.dateTime`. */
  targetTime: Date;
  /** The analysis instant — injectable for deterministic tests. */
  now?: Date;
}

function toDurationPredictionReference(duration: ExpectedCommuteDurationV0): DurationPredictionReference {
  return {
    modelVersion: duration.modelVersion,
    configFingerprint: duration.configFingerprint,
    predictionStatus: duration.predictionStatus,
    baselineDurationMinutes: duration.baselineDurationMinutes,
    centralEstimateMinutes: duration.centralEstimateMinutes,
    lowerBoundMinutes: duration.lowerBoundMinutes,
    upperBoundMinutes: duration.upperBoundMinutes,
  };
}

/**
 * WinterRoute's V0 timing recommendation — the single entry point for
 * `lib/timing/`. Pure and deterministic: no fetching, no I/O. Never
 * reads `ExperimentalCommuteRiskV0` — the risk index and this model stay
 * fully independent (see `types.ts`'s doc comment and
 * docs/decisions/0011-timing-recommendation-v0.md).
 */
export function computeTimingRecommendation(input: ComputeTimingRecommendationInput): CommuteTimingRecommendationV0 {
  const { duration, preference, targetTime } = input;
  const now = input.now ?? new Date();
  const analyzedAt = now;

  if (preference === "arriveBy") {
    const computation = computeArriveBy(duration, targetTime, now);
    const { summarySentences, reasons, notes } = computation.result?.recommendedDepartureTime
      ? buildArriveByExplanation(duration, computation.result)
      : { summarySentences: [], reasons: [], notes: [] };

    return {
      modelVersion: timingModelV0Config.modelVersion,
      configFingerprint: computeTimingConfigFingerprint(),
      analyzedAt,
      preference,
      status: computation.status,
      statusReasons: computation.statusReasons,
      arriveBy: computation.result,
      summarySentences,
      explanation: reasons,
      notes,
      dataCoverage: duration.dataCoverage,
      durationPredictionReference: toDurationPredictionReference(duration),
    };
  }

  const computation = computeLeaveAt(duration, targetTime);
  const { summarySentences, reasons, notes } = computation.result?.expectedArrivalLower
    ? buildLeaveAtExplanation(duration, computation.result)
    : { summarySentences: [], reasons: [], notes: [] };

  return {
    modelVersion: timingModelV0Config.modelVersion,
    configFingerprint: computeTimingConfigFingerprint(),
    analyzedAt,
    preference,
    status: computation.status,
    statusReasons: computation.statusReasons,
    leaveAt: computation.result,
    summarySentences,
    explanation: reasons,
    notes,
    dataCoverage: duration.dataCoverage,
    durationPredictionReference: toDurationPredictionReference(duration),
  };
}
