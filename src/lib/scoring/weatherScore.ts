import { riskModelV0Config, scoreOnCurve, scoreOnInverseCurve } from "./config";
import { pluralize } from "./pluralize";
import type { CommuteFeatureSet, FactorContribution, FactorScore, SegmentFeatureSet } from "./types";

interface SegmentWeatherResult {
  total: number;
  contributions: FactorContribution[];
}

/**
 * One segment's weather severity: each phenomenon is scored 0-100 on its
 * own curve, then scaled by how sensitive THIS segment's actual mode is
 * to it (`config.weather.modeSensitivity`) — e.g. 60km/h wind scores high
 * for a cyclist, low for a driver. The segment's overall value is the
 * MAXIMUM mode-adjusted phenomenon score, not a sum — deliberately, so a
 * single severe condition isn't diluted by several mild ones, and so
 * correlated phenomena (heavy snow + a freezing temperature describing
 * the same storm) don't stack into an inflated total. See
 * docs/decisions/0008-risk-model-v0.md "Avoiding double counting."
 */
function scoreSegmentWeather(segment: SegmentFeatureSet): SegmentWeatherResult | undefined {
  const weather = segment.weather;
  if (weather.availability !== "available") return undefined;

  const sensitivity =
    riskModelV0Config.weather.modeSensitivity[segment.mode as keyof typeof riskModelV0Config.weather.modeSensitivity] ??
    riskModelV0Config.weather.modeSensitivity.drive;
  const { precipitationCurve, snowfallCurve, windCurve, visibilityCurve } = riskModelV0Config.weather;

  const contributions: FactorContribution[] = [];

  if (weather.maxPrecipitationMm !== undefined) {
    const raw = scoreOnCurve(weather.maxPrecipitationMm, precipitationCurve);
    contributions.push({
      key: "precipitation",
      label: "Precipitation",
      rawValue: raw,
      weight: sensitivity.precipitation,
      detail:
        `${weather.maxPrecipitationMm.toFixed(1)}mm max forecast` +
        (weather.precipitationAgreementRatio !== undefined
          ? `, ${Math.round(weather.precipitationAgreementRatio * 100)}% model agreement`
          : ""),
    });
  }

  if (weather.maxSnowfallCm !== undefined) {
    const raw = scoreOnCurve(weather.maxSnowfallCm, snowfallCurve);
    contributions.push({
      key: "snowfall",
      label: "Snowfall",
      rawValue: raw,
      weight: sensitivity.snow,
      detail: `${weather.maxSnowfallCm.toFixed(1)}cm max forecast`,
    });
  }

  if (weather.maxWindSpeedKmh !== undefined) {
    const raw = scoreOnCurve(weather.maxWindSpeedKmh, windCurve);
    contributions.push({
      key: "wind",
      label: "Wind",
      rawValue: raw,
      weight: sensitivity.wind,
      detail: `${Math.round(weather.maxWindSpeedKmh)} km/h max forecast`,
    });
  }

  if (weather.minVisibilityKm !== undefined) {
    const raw = scoreOnInverseCurve(weather.minVisibilityKm, visibilityCurve);
    contributions.push({
      key: "visibility",
      label: "Visibility",
      rawValue: raw,
      weight: sensitivity.visibility,
      detail: `as low as ${weather.minVisibilityKm.toFixed(1)}km`,
    });
  }

  if (weather.belowFreezingTemperature) {
    contributions.push({
      key: "freezing",
      label: "Below-freezing temperature",
      rawValue: 100,
      weight: sensitivity.freezing,
      detail: `possible freezing conditions (as low as ${weather.minTemperatureC?.toFixed(1)}°C)`,
    });
  } else if (weather.precipitationNearFreezing) {
    contributions.push({
      key: "precipitationNearFreezing",
      label: "Precipitation near freezing",
      rawValue: 80,
      weight: sensitivity.freezing,
      detail: "possible freezing rain / mixed precipitation",
    });
  }

  if (contributions.length === 0) return { total: 0, contributions: [] };

  const modeAdjusted = contributions.map((c) => c.rawValue * c.weight);
  return { total: Math.min(100, Math.max(...modeAdjusted)), contributions };
}

/**
 * WeatherSeverityScore — always potentially applicable (every mode has
 * *some* weather sensitivity, even if small for rail), so this factor is
 * only ever `"scored"` or `"unavailable"`, never `"not-applicable"`.
 *
 * The route-level score is the duration-weighted average of scoreable
 * segments' own scores (segments with no weather data are excluded from
 * both the numerator and denominator, never treated as zero severity).
 * Reported contributions are the single worst-scoring segment's own
 * phenomenon breakdown, plus a route-level official-alert bonus (ECCC
 * alerts aren't segment-tagged in the current domain model).
 */
export function scoreWeatherFactor(features: CommuteFeatureSet): FactorScore {
  const scored = features.segments
    .map((segment) => ({ segment, result: scoreSegmentWeather(segment) }))
    .filter((entry): entry is { segment: SegmentFeatureSet; result: SegmentWeatherResult } => entry.result !== undefined);

  if (scored.length === 0) {
    return {
      factor: "weather",
      status: "unavailable",
      reason: "No weather data is available for any segment of this route.",
      contributions: [],
    };
  }

  const totalShare = scored.reduce((sum, entry) => sum + (entry.segment.routeDurationShare ?? 0), 0);
  const weightedAverage =
    totalShare > 0
      ? scored.reduce((sum, entry) => sum + entry.result.total * (entry.segment.routeDurationShare ?? 0), 0) / totalShare
      : scored.reduce((sum, entry) => sum + entry.result.total, 0) / scored.length;

  const worst = scored.reduce((a, b) => (b.result.total > a.result.total ? b : a));
  const contributions: FactorContribution[] = [...worst.result.contributions];

  const { alertBonus, alertBonusCap } = riskModelV0Config.weather;
  const alertContribution = Math.min(alertBonusCap, features.weather.relevantAlertCount * alertBonus);

  let overall = weightedAverage;
  if (alertContribution > 0) {
    contributions.push({
      key: "officialAlert",
      label: "Official weather alert",
      rawValue: alertContribution,
      weight: 1,
      detail: `${features.weather.relevantAlertCount} relevant ECCC ${pluralize(features.weather.relevantAlertCount, "alert")}: ${features.weather.alertTypes.join(", ")}`,
    });
    overall = Math.min(100, overall + alertContribution);
  }

  return { factor: "weather", status: "scored", score: Math.round(overall), contributions };
}
