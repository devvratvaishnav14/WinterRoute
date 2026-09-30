import type { CommuteFeatureSet, SegmentFeatureSet } from "@/lib/scoring/types";
import { durationModelV0Config } from "./config";
import type { DelayContribution } from "./types";

type WalkCycleConfig = (typeof durationModelV0Config)["walk"];

/**
 * Weather-driven uncertainty for one walk/cycle segment. Per explicit
 * instruction, V0 does not claim a calibrated exact speed reduction —
 * every condition here widens the UPPER bound only
 * (`centralAdjustmentMinutes` is 0), scaled by the segment's own
 * baseline duration (a 5-minute walk and a 45-minute walk don't get the
 * same flat allowance) and capped.
 */
function buildSegmentWeatherWidening(segment: SegmentFeatureSet, config: WalkCycleConfig): number {
  const weather = segment.weather;
  if (weather.availability !== "available") return 0;

  const hours = (segment.durationMinutes ?? 0) / 60;
  let widening = 0;

  if (weather.snowfallPresent) widening += config.upperWideningMinutesPerHour.snow * hours;
  if (weather.belowFreezingTemperature) widening += config.upperWideningMinutesPerHour.freezing * hours;
  if ((weather.maxPrecipitationMm ?? 0) >= config.conditions.heavyPrecipitationMm) {
    widening += config.upperWideningMinutesPerHour.heavyPrecipitation * hours;
  }
  if ((weather.maxWindSpeedKmh ?? 0) >= config.conditions.severeWindKmh) {
    widening += config.upperWideningMinutesPerHour.severeWind * hours;
  }

  return Math.min(config.maxUpperWideningMinutes, widening);
}

function describeConditions(segment: SegmentFeatureSet, config: WalkCycleConfig): string[] {
  const weather = segment.weather;
  const notes: string[] = [];
  if (weather.availability !== "available") return notes;
  if (weather.snowfallPresent) notes.push("snowfall");
  if (weather.belowFreezingTemperature) notes.push("below-freezing temperatures");
  if ((weather.maxPrecipitationMm ?? 0) >= config.conditions.heavyPrecipitationMm) notes.push("heavy precipitation");
  if ((weather.maxWindSpeedKmh ?? 0) >= config.conditions.severeWindKmh) notes.push("strong wind");
  return notes;
}

/** Builds one contribution per walk segment and one per cycle segment (summed across all segments of that mode), plus a route-wide official-alert allowance when relevant. */
export function buildWalkCycleContributions(features: CommuteFeatureSet): DelayContribution[] {
  const contributions: DelayContribution[] = [];

  for (const mode of ["walk", "cycle"] as const) {
    const config = durationModelV0Config[mode];
    const segments = features.segments.filter((s) => s.mode === mode);
    if (segments.length === 0) continue;

    let widening = 0;
    const notes = new Set<string>();
    for (const segment of segments) {
      widening += buildSegmentWeatherWidening(segment, config);
      for (const note of describeConditions(segment, config)) notes.add(note);
    }
    widening = Math.min(config.maxUpperWideningMinutes, widening);

    if (features.weather.freezingRelatedAlert || features.weather.relevantAlertCount > 0) {
      widening = Math.min(config.maxUpperWideningMinutes, widening + config.upperWideningMinutesPerHour.severeAlert);
      notes.add("an official weather alert");
    }

    if (widening > 0) {
      contributions.push({
        key: `${mode}WeatherUncertainty`,
        label: `${mode === "walk" ? "Walking" : "Cycling"} weather uncertainty`,
        centralMinutes: config.centralAdjustmentMinutes,
        lowerMinutes: 0,
        upperMinutes: widening,
        provenance: "heuristic-v0",
        explanation: `${notes.size > 0 ? Array.from(notes).join(", ") : "Weather conditions"} may add time to the ${mode === "walk" ? "walking" : "cycling"} portion of this route — not independently measured, so the upper end of the estimate allows for it.`,
        appliesTo: mode,
      });
    }
  }

  return contributions;
}
