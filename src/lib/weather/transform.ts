import type { OpenMeteoLocationResult, OpenMeteoModelKey } from "./providers/openMeteo";
import { OPEN_METEO_MODELS } from "./providers/openMeteo";
import { describeWeatherCode } from "./weatherCodes";
import type { WeatherForecastPoint, WeatherModelSource } from "./types";

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value;
}

/**
 * Index of the hourly timestamp nearest `target`, or `null` if the closest
 * one is more than `toleranceMinutes` away (i.e. `target` isn't really
 * covered by this response — treated the same as "missing," not matched
 * to a misleadingly distant hour).
 */
export function findNearestHourlyIndex(
  times: Date[],
  target: Date,
  toleranceMinutes = 90,
): number | null {
  let bestIndex: number | null = null;
  let bestDiffMs = Infinity;

  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(times[i].getTime() - target.getTime());
    if (diff < bestDiffMs) {
      bestDiffMs = diff;
      bestIndex = i;
    }
  }

  if (bestIndex === null || bestDiffMs > toleranceMinutes * 60_000) return null;
  return bestIndex;
}

export function makeWeatherModelSource(model: OpenMeteoModelKey, retrievedAt: Date): WeatherModelSource {
  const info = OPEN_METEO_MODELS[model];
  return {
    provider: "open-meteo",
    modelId: info.modelId,
    displayName: info.displayName,
    organization: info.organization,
    resolutionKm: info.resolutionKm,
    retrievedAt,
  };
}

/**
 * Converts one model's raw hourly response for one location into a single
 * `WeatherForecastPoint` at the nearest covered hour to `targetTime`, or
 * `null` if that time isn't covered.
 *
 * `temperature_2m` is used as the "is this hour actually covered"
 * sentinel: Open-Meteo nulls out every hourly variable in lockstep once a
 * request goes past a model's real forecast horizon (confirmed
 * empirically — see docs/data-sources.md), so a null temperature at the
 * matched hour means the whole point is unavailable, not that
 * temperature specifically is missing. Every other field is preserved or
 * omitted independently — a model can report temperature but not
 * precipitation probability, and that's represented honestly as
 * `precipitationProbabilityPercent: undefined`, never a substituted 0.
 */
export function openMeteoResultToForecastPoint(params: {
  result: OpenMeteoLocationResult;
  targetTime: Date;
  model: OpenMeteoModelKey;
  retrievedAt: Date;
}): WeatherForecastPoint | null {
  const { result, targetTime, model, retrievedAt } = params;
  const times = result.hourly.time.map((t) => new Date(`${t}Z`));
  const index = findNearestHourlyIndex(times, targetTime);
  if (index === null) return null;

  const temperatureC = numberOrUndefined(result.hourly.temperature_2m?.[index]);
  if (temperatureC === undefined) return null;

  const visibilityMeters = numberOrUndefined(result.hourly.visibility?.[index]);
  const weatherCode = numberOrUndefined(result.hourly.weather_code?.[index]);

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    elevationMeters: result.elevation,
    validTime: times[index],
    source: makeWeatherModelSource(model, retrievedAt),
    temperatureC,
    apparentTemperatureC: numberOrUndefined(result.hourly.apparent_temperature?.[index]),
    precipitationMm: numberOrUndefined(result.hourly.precipitation?.[index]),
    rainMm: numberOrUndefined(result.hourly.rain?.[index]),
    snowfallCm: numberOrUndefined(result.hourly.snowfall?.[index]),
    precipitationProbabilityPercent: numberOrUndefined(result.hourly.precipitation_probability?.[index]),
    weatherCode,
    weatherDescription: describeWeatherCode(weatherCode),
    cloudCoverPercent: numberOrUndefined(result.hourly.cloud_cover?.[index]),
    windSpeedKmh: numberOrUndefined(result.hourly.wind_speed_10m?.[index]),
    windGustsKmh: numberOrUndefined(result.hourly.wind_gusts_10m?.[index]),
    visibilityKm: visibilityMeters === undefined ? undefined : visibilityMeters / 1000,
  };
}
