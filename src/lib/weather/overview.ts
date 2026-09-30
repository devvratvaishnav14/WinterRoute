import type { RouteWeatherAnalysis } from "./types";

export interface RouteWeatherOverview {
  hasData: boolean;
  temperatureRangeC?: { min: number; max: number };
  windRangeKmh?: { min: number; max: number };
  /** How many distinct models had data anywhere on the route, and how many of those predicted precipitation/snow somewhere. */
  precipitation: { modelsPredicting: number; modelsWithData: number };
  snow: { modelsPredicting: number; modelsWithData: number };
}

/**
 * Collapses a per-sample, per-model analysis into the compact route-wide
 * summary the weather preview shows (e.g. "4-7°C across route",
 * "3/3 models predict rain on part of the route"). This is presentation
 * aggregation only — the underlying per-sample, per-model values in
 * `analysis.samples` are untouched and remain the source of truth for any
 * detail view.
 *
 * `modelsWithData` is the count of models that actually returned data
 * *anywhere* on the route, not a hardcoded "3" — a model that failed
 * entirely isn't counted as "not predicting precipitation," it's just
 * absent (see docs/architecture.md "Partial provider failure").
 */
export function summarizeRouteWeatherOverview(analysis: RouteWeatherAnalysis): RouteWeatherOverview {
  const allForecasts = analysis.samples.flatMap((sample) => sample.forecasts);

  const temperatures = allForecasts.map((f) => f.temperatureC).filter((v): v is number => v !== undefined);
  const winds = allForecasts.map((f) => f.windSpeedKmh).filter((v): v is number => v !== undefined);

  const modelsWithData = new Set(allForecasts.map((f) => f.source.displayName));
  const modelsWithPrecip = new Set(
    allForecasts.filter((f) => (f.precipitationMm ?? 0) > 0).map((f) => f.source.displayName),
  );
  const modelsWithSnow = new Set(
    allForecasts.filter((f) => (f.snowfallCm ?? 0) > 0).map((f) => f.source.displayName),
  );

  return {
    hasData: allForecasts.length > 0,
    temperatureRangeC:
      temperatures.length > 0 ? { min: Math.min(...temperatures), max: Math.max(...temperatures) } : undefined,
    windRangeKmh: winds.length > 0 ? { min: Math.min(...winds), max: Math.max(...winds) } : undefined,
    precipitation: { modelsPredicting: modelsWithPrecip.size, modelsWithData: modelsWithData.size },
    snow: { modelsPredicting: modelsWithSnow.size, modelsWithData: modelsWithData.size },
  };
}

/** Unique named waypoints in route order (e.g. "SFU Burnaby → New Westminster → Surrey Central"), skipping unnamed interpolated points. */
export function describeSampleLocations(analysis: RouteWeatherAnalysis): string {
  const labels = analysis.samples.map((s) => s.point.label).filter((label) => label !== "En route");
  const deduped = labels.filter((label, index) => index === 0 || label !== labels[index - 1]);
  return deduped.join(" → ");
}
