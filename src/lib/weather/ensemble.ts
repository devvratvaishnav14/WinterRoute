import type { WeatherEnsembleSummary, WeatherForecastPoint } from "./types";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function numbers(forecasts: WeatherForecastPoint[], pick: (f: WeatherForecastPoint) => number | undefined): number[] {
  return forecasts.map(pick).filter((v): v is number => v !== undefined);
}

/**
 * Transparent descriptive statistics across whichever models actually
 * returned data for a sample — median/min/max and simple "how many models
 * predict X" counts. Deliberately NOT a weighted ensemble or a confidence
 * score: no empirical basis exists yet for weighting one model over
 * another (see docs/architecture.md "Model agreement vs. calibrated
 * confidence" — that distinction is intentional, not an oversight).
 *
 * "Predicting precipitation/snow" means a forecast value strictly greater
 * than 0 for that model at that point/time.
 */
export function summarizeEnsemble(
  forecasts: WeatherForecastPoint[],
  modelsAttempted: number,
): WeatherEnsembleSummary {
  const temperatures = numbers(forecasts, (f) => f.temperatureC);
  const precipitation = numbers(forecasts, (f) => f.precipitationMm);
  const snowfall = numbers(forecasts, (f) => f.snowfallCm);
  const wind = numbers(forecasts, (f) => f.windSpeedKmh);

  return {
    modelsAttempted,
    modelsAvailable: forecasts.length,
    temperatureC:
      temperatures.length > 0
        ? { median: median(temperatures), min: Math.min(...temperatures), max: Math.max(...temperatures) }
        : undefined,
    precipitationMm:
      precipitation.length > 0
        ? {
            median: median(precipitation),
            min: Math.min(...precipitation),
            max: Math.max(...precipitation),
            modelsPredicting: precipitation.filter((v) => v > 0).length,
          }
        : undefined,
    snowfallCm:
      snowfall.length > 0
        ? {
            median: median(snowfall),
            min: Math.min(...snowfall),
            max: Math.max(...snowfall),
            modelsPredicting: snowfall.filter((v) => v > 0).length,
          }
        : undefined,
    windSpeedKmh:
      wind.length > 0 ? { median: median(wind), min: Math.min(...wind), max: Math.max(...wind) } : undefined,
  };
}
