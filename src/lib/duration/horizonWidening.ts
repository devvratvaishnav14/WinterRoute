import type { CommuteFeatureSet } from "@/lib/scoring/types";
import { durationModelV0Config } from "./config";
import type { DelayContribution } from "./types";

/**
 * A small additional upper-bound allowance that grows with how far out
 * the trip is — a 30-minutes-away estimate and a 70-hours-away estimate
 * shouldn't carry identically-wide ranges. Deliberately linear and
 * capped, never framed as a confidence percentage.
 */
export function buildHorizonWidening(features: CommuteFeatureSet): DelayContribution[] {
  const { perHourUpperWideningMinutes, maxUpperWideningMinutes } = durationModelV0Config.horizon;
  const hours = features.temporal.forecastHorizonHours;
  const widening = Math.min(maxUpperWideningMinutes, hours * perHourUpperWideningMinutes);

  if (widening <= 0) return [];

  const roundedHours = Math.round(hours);

  return [
    {
      key: "forecastHorizon",
      label: "Forecast horizon",
      centralMinutes: 0,
      lowerMinutes: 0,
      upperMinutes: widening,
      provenance: "heuristic-v0",
      explanation: `This trip is ${roundedHours} ${roundedHours === 1 ? "hour" : "hours"} out — the upper end of the estimate allows a little more room the farther out a trip is.`,
      appliesTo: "route",
    },
  ];
}
