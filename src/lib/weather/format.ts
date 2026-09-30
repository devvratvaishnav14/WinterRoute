import type { RouteWeatherOverview } from "./overview";

export function formatTemperatureRangeC(range: { min: number; max: number } | undefined): string {
  if (!range) return "No temperature data available";
  if (Math.round(range.min) === Math.round(range.max)) return `${Math.round(range.min)}°C across route`;
  return `${Math.round(range.min)}-${Math.round(range.max)}°C across route`;
}

export function formatWindRangeKmh(range: { min: number; max: number } | undefined): string {
  if (!range) return "No wind data available";
  if (Math.round(range.min) === Math.round(range.max)) return `${Math.round(range.min)} km/h`;
  return `${Math.round(range.min)}-${Math.round(range.max)} km/h`;
}

/** e.g. "3/3 models predict rain on part of the route" or "No model currently predicts measurable rain." */
export function formatPrecipitationSummary(precipitation: RouteWeatherOverview["precipitation"]): string {
  if (precipitation.modelsWithData === 0) return "No forecast data available";
  if (precipitation.modelsPredicting === 0) return "No model currently predicts measurable rain";
  return `${precipitation.modelsPredicting}/${precipitation.modelsWithData} models predict rain on part of the route`;
}

export function formatSnowSummary(snow: RouteWeatherOverview["snow"]): string {
  if (snow.modelsWithData === 0) return "No forecast data available";
  if (snow.modelsPredicting === 0) return "No model currently predicts measurable snow";
  return `${snow.modelsPredicting}/${snow.modelsWithData} models predict snow on part of the route`;
}

/** A short value plus an optional secondary detail — only present when it adds real information (i.e. models were actually consulted and agree). Used by the concise, normal-user-facing results card; the technical wording above (model counts always spelled out) stays for the dev-diagnostic view. */
export interface SimpleConditionSummary {
  value: string;
  detail?: string;
}

function summarizeModelAgreement(modelsPredicting: number, modelsWithData: number): SimpleConditionSummary {
  if (modelsWithData === 0) return { value: "Unavailable" };
  if (modelsPredicting === 0) return { value: "Not expected" };
  if (modelsPredicting === modelsWithData) {
    return { value: "Expected along part of route", detail: `${modelsPredicting}/${modelsWithData} forecast models agree` };
  }
  return { value: "Forecast models disagree" };
}

/**
 * Concise rain summary for the normal results card — "Not expected",
 * "Expected along part of route" (with a "N/N forecast models agree"
 * detail when genuinely useful), "Forecast models disagree", or
 * "Unavailable" only when no model actually had data (never conflated
 * with "Not expected" — see docs/architecture.md "No risk language in
 * this stage" for the same no-model != no-phenomenon distinction).
 */
export function summarizeRainForResults(precipitation: RouteWeatherOverview["precipitation"]): SimpleConditionSummary {
  return summarizeModelAgreement(precipitation.modelsPredicting, precipitation.modelsWithData);
}

/** Concise snow summary — see `summarizeRainForResults`. */
export function summarizeSnowForResults(snow: RouteWeatherOverview["snow"]): SimpleConditionSummary {
  return summarizeModelAgreement(snow.modelsPredicting, snow.modelsWithData);
}

function formatCompactRange(range: { min: number; max: number } | undefined, unit: string): string {
  if (!range) return "Unavailable";
  const min = Math.round(range.min);
  const max = Math.round(range.max);
  return min === max ? `${min}${unit}` : `${min}-${max}${unit}`;
}

/** Concise temperature range for the normal results card — e.g. "7-11°C", or "Unavailable" when no data (never "Not expected", which only applies to a phenomenon like rain/snow). */
export function summarizeTemperatureForResults(range: { min: number; max: number } | undefined): string {
  return formatCompactRange(range, "°C");
}

/** Concise wind range for the normal results card — see `summarizeTemperatureForResults`. */
export function summarizeWindForResults(range: { min: number; max: number } | undefined): string {
  return formatCompactRange(range, " km/h");
}
