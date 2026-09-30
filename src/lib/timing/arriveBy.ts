import type { ExpectedCommuteDurationV0 } from "@/lib/duration/types";
import { timingModelV0Config } from "./config";
import { addMinutes, diffMinutes, floorToMinute, roundToMinute } from "./roundTime";
import type { ArriveByTimingResult, TimingArrivalWindow, TimingRecommendationStatus } from "./types";

export interface ArriveByComputation {
  status: TimingRecommendationStatus;
  statusReasons: string[];
  result?: ArriveByTimingResult;
}

function arrivalWindowFrom(departure: Date, duration: ExpectedCommuteDurationV0): TimingArrivalWindow {
  return {
    lower: roundToMinute(addMinutes(departure, duration.lowerBoundMinutes)),
    central: roundToMinute(addMinutes(departure, duration.centralEstimateMinutes)),
    upper: roundToMinute(addMinutes(departure, duration.upperBoundMinutes)),
  };
}

/**
 * Converts an Arrive-By target + `ExpectedCommuteDurationV0` into a
 * "leave by" recommendation.
 *
 * `recommendedDeparture = target - upperBound` — the upper bound is used
 * (not the central estimate) because it already contains factual
 * traffic/realtime effects, modeled uncertainty, forecast-horizon
 * widening, weather uncertainty, and road-event uncertainty; adding a
 * further arbitrary safety buffer on top would double-count uncertainty
 * the duration model already accounted for.
 *
 * **Conservative cap**: `recommendedDeparture` is never allowed to be
 * LATER than `typicalDeparture` (`target - baseline`), even when the
 * traffic-aware upper bound is genuinely faster than baseline (a real,
 * confirmed case — see the duration-model stage). WinterRoute may
 * recommend leaving at the same time as typical, or earlier, but V0
 * deliberately never recommends leaving later than typical purely
 * because current conditions look unusually light — conditions can
 * change, and "traffic is light right now, leave later" is exactly the
 * kind of advice that ages badly.
 */
export function computeArriveBy(
  duration: ExpectedCommuteDurationV0,
  targetArrivalTime: Date,
  now: Date,
): ArriveByComputation {
  if (duration.predictionStatus === "insufficient-data") {
    return {
      status: "insufficient-data",
      statusReasons: duration.statusReasons.length > 0 ? duration.statusReasons : ["Not enough information to estimate this trip's duration."],
      result: { targetArrivalTime },
    };
  }

  if (duration.predictionStatus === "route-disrupted") {
    return {
      status: "route-disrupted",
      statusReasons: duration.statusReasons,
      result: { targetArrivalTime },
    };
  }

  const typicalDepartureTime = floorToMinute(addMinutes(targetArrivalTime, -duration.baselineDurationMinutes));
  const rawRecommended = floorToMinute(addMinutes(targetArrivalTime, -duration.upperBoundMinutes));
  const recommendedDepartureTime = new Date(Math.min(rawRecommended.getTime(), typicalDepartureTime.getTime()));
  const leaveEarlierByMinutes = Math.round(diffMinutes(typicalDepartureTime, recommendedDepartureTime));

  const expectedArrivalWindowWhenLeavingRecommended = arrivalWindowFrom(recommendedDepartureTime, duration);

  const flooredNow = floorToMinute(now);
  const missed = recommendedDepartureTime.getTime() < flooredNow.getTime();

  const baseResult: ArriveByTimingResult = {
    targetArrivalTime,
    typicalDepartureTime,
    recommendedDepartureTime,
    leaveEarlierByMinutes,
    expectedArrivalWindowWhenLeavingRecommended,
  };

  const baseStatus: TimingRecommendationStatus = duration.predictionStatus === "limited-data" ? "limited-data" : "available";
  const baseReasons = duration.predictionStatus === "limited-data" ? duration.statusReasons : [];

  if (!missed) {
    return { status: baseStatus, statusReasons: baseReasons, result: baseResult };
  }

  const analysisAgeMinutes = diffMinutes(now, duration.analyzedAt);
  const leaveNowAnalysisStale = analysisAgeMinutes > timingModelV0Config.staleAnalysisToleranceMinutes;

  return {
    status: "departure-window-missed",
    statusReasons: [...baseReasons, "The recommended departure time has already passed."],
    result: {
      ...baseResult,
      leaveNowAnalysisStale,
      leaveNowExpectedArrivalRange: leaveNowAnalysisStale ? undefined : arrivalWindowFrom(now, duration),
    },
  };
}
