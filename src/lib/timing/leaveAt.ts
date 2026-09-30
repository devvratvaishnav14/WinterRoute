import type { ExpectedCommuteDurationV0 } from "@/lib/duration/types";
import { addMinutes, diffMinutes, roundToMinute } from "./roundTime";
import type { LeaveAtTimingResult, TimingRecommendationStatus } from "./types";

export interface LeaveAtComputation {
  status: TimingRecommendationStatus;
  statusReasons: string[];
  result?: LeaveAtTimingResult;
}

/**
 * Converts a Leave-At departure + `ExpectedCommuteDurationV0` into an
 * expected arrival range. Never invents a recommendation — a
 * user-selected Leave At time is a planning input, not an arrival
 * deadline, so there is nothing to recommend leaving "earlier" than.
 */
export function computeLeaveAt(
  duration: ExpectedCommuteDurationV0,
  selectedDepartureTime: Date,
): LeaveAtComputation {
  if (duration.predictionStatus === "insufficient-data") {
    return {
      status: "insufficient-data",
      statusReasons: duration.statusReasons.length > 0 ? duration.statusReasons : ["Not enough information to estimate this trip's duration."],
      result: { selectedDepartureTime },
    };
  }

  if (duration.predictionStatus === "route-disrupted") {
    return {
      status: "route-disrupted",
      statusReasons: duration.statusReasons,
      result: { selectedDepartureTime },
    };
  }

  const typicalArrivalTime = roundToMinute(addMinutes(selectedDepartureTime, duration.baselineDurationMinutes));
  const expectedArrivalLower = roundToMinute(addMinutes(selectedDepartureTime, duration.lowerBoundMinutes));
  const expectedArrivalCentral = roundToMinute(addMinutes(selectedDepartureTime, duration.centralEstimateMinutes));
  const expectedArrivalUpper = roundToMinute(addMinutes(selectedDepartureTime, duration.upperBoundMinutes));

  const result: LeaveAtTimingResult = {
    selectedDepartureTime,
    typicalArrivalTime,
    expectedArrivalLower,
    expectedArrivalCentral,
    expectedArrivalUpper,
    arrivalDifferenceFromTypicalMinutes: {
      lower: Math.round(diffMinutes(expectedArrivalLower, typicalArrivalTime)),
      upper: Math.round(diffMinutes(expectedArrivalUpper, typicalArrivalTime)),
    },
  };

  const status: TimingRecommendationStatus = duration.predictionStatus === "limited-data" ? "limited-data" : "available";
  const statusReasons = duration.predictionStatus === "limited-data" ? duration.statusReasons : [];

  return { status, statusReasons, result };
}
