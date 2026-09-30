import type { RouteSegment } from "@/lib/route/types";
import type { RouteWeatherAnalysis, RouteWeatherSample, WeatherForecastPoint } from "@/lib/weather/types";
import { riskModelV0Config } from "./config";
import type { RouteWeatherFeatures, SegmentFeatureSet, SegmentWeatherFeatures } from "./types";

function forecastsForSamples(samples: RouteWeatherSample[]): WeatherForecastPoint[] {
  return samples.flatMap((s) => s.forecasts);
}

function numericValues(forecasts: WeatherForecastPoint[], selector: (f: WeatherForecastPoint) => number | undefined): number[] {
  return forecasts.map(selector).filter((v): v is number => v !== undefined);
}

/** The largest (max - min) spread across models observed at any single sample point — a per-point disagreement measure, not a spread across unrelated points/times. */
function maxModelSpread(
  samples: RouteWeatherSample[],
  selector: (f: WeatherForecastPoint) => number | undefined,
): number | undefined {
  let maxSpread: number | undefined;
  for (const sample of samples) {
    const values = numericValues(sample.forecasts, selector);
    if (values.length < 2) continue;
    const spread = Math.max(...values) - Math.min(...values);
    if (maxSpread === undefined || spread > maxSpread) maxSpread = spread;
  }
  return maxSpread;
}

/**
 * `modelsPredicting / modelsWithThisVariable` — deliberately scoped to
 * models that actually reported this specific variable (a model can
 * report temperature but genuinely lack precipitation data — see
 * docs/data-sources.md), not to every model present at the sample.
 */
function agreementRatio(
  forecasts: WeatherForecastPoint[],
  selector: (f: WeatherForecastPoint) => number | undefined,
  predicate: (value: number) => boolean,
): number | undefined {
  const withData = forecasts.filter((f) => selector(f) !== undefined);
  if (withData.length === 0) return undefined;
  const predicting = withData.filter((f) => predicate(selector(f) as number));
  return predicting.length / withData.length;
}

function buildWeatherAggregates(forecasts: WeatherForecastPoint[], samples: RouteWeatherSample[]) {
  const { notableSnowfallCm } = riskModelV0Config.weather;

  const temperatures = numericValues(forecasts, (f) => f.temperatureC);
  const apparentTemperatures = numericValues(forecasts, (f) => f.apparentTemperatureC);
  const precipitations = numericValues(forecasts, (f) => f.precipitationMm);
  const snowfalls = numericValues(forecasts, (f) => f.snowfallCm);
  const winds = numericValues(forecasts, (f) => f.windSpeedKmh);
  const gusts = numericValues(forecasts, (f) => f.windGustsKmh);
  const visibilities = numericValues(forecasts, (f) => f.visibilityKm);

  return {
    minTemperatureC: temperatures.length ? Math.min(...temperatures) : undefined,
    maxTemperatureC: temperatures.length ? Math.max(...temperatures) : undefined,
    minApparentTemperatureC: apparentTemperatures.length ? Math.min(...apparentTemperatures) : undefined,
    temperatureModelSpreadC: maxModelSpread(samples, (f) => f.temperatureC),
    maxPrecipitationMm: precipitations.length ? Math.max(...precipitations) : undefined,
    precipitationAgreementRatio: agreementRatio(forecasts, (f) => f.precipitationMm, (v) => v > 0),
    maxSnowfallCm: snowfalls.length ? Math.max(...snowfalls) : undefined,
    snowAgreementRatio: agreementRatio(forecasts, (f) => f.snowfallCm, (v) => v >= notableSnowfallCm),
    maxWindSpeedKmh: winds.length ? Math.max(...winds) : undefined,
    maxWindGustKmh: gusts.length ? Math.max(...gusts) : undefined,
    minVisibilityKm: visibilities.length ? Math.min(...visibilities) : undefined,
  };
}

/** Weather features for one segment, built only from samples the sampling module itself tagged with this segment's ID — see `lib/weather/sampling.ts` and `types.ts`'s doc comment on why a segment can genuinely have none. */
export function buildSegmentWeatherFeatures(segment: RouteSegment, samples: RouteWeatherSample[]): SegmentWeatherFeatures {
  const segmentSamples = samples.filter((s) => s.point.segmentId === segment.id);

  if (segmentSamples.length === 0) {
    return {
      availability: "unavailable",
      sampleCount: 0,
      belowFreezingTemperature: false,
      precipitationNearFreezing: false,
      snowfallPresent: false,
    };
  }

  const forecasts = forecastsForSamples(segmentSamples);
  const aggregates = buildWeatherAggregates(forecasts, segmentSamples);
  const { freezingThresholdC, nearFreezingBufferC, notableSnowfallCm } = riskModelV0Config.weather;

  const belowFreezingTemperature = aggregates.minTemperatureC !== undefined && aggregates.minTemperatureC < freezingThresholdC;
  const precipitationNearFreezing =
    aggregates.minTemperatureC !== undefined &&
    aggregates.minTemperatureC <= freezingThresholdC + nearFreezingBufferC &&
    (aggregates.maxPrecipitationMm ?? 0) > 0;
  const snowfallPresent = (aggregates.maxSnowfallCm ?? 0) >= notableSnowfallCm;

  return {
    availability: "available",
    sampleCount: segmentSamples.length,
    ...aggregates,
    belowFreezingTemperature,
    precipitationNearFreezing,
    snowfallPresent,
  };
}

const FREEZING_ALERT_KEYWORDS = /frost|freez|ice|icy|winter storm|snow/i;

/** Categorizes an alert's own official title against freeze-related keywords — labeling what ECCC itself already published, never inventing a new condition. */
function isFreezingRelatedAlert(title: string): boolean {
  return FREEZING_ALERT_KEYWORDS.test(title);
}

/**
 * Route-level weather features, computed directly from every sample on
 * the route (including the untagged final-destination boundary point, so
 * nothing a segment-level view would miss is lost here).
 */
export function buildRouteWeatherFeatures(
  analysis: RouteWeatherAnalysis | null,
  segmentFeatures: SegmentFeatureSet[],
): RouteWeatherFeatures {
  if (!analysis || analysis.samples.length === 0) {
    return {
      availability: "unavailable",
      modelsAvailable: 0,
      samplePointCount: 0,
      relevantAlertCount: 0,
      alertTypes: [],
      freezingRelatedAlert: false,
      notableWeatherExposureShare: 0,
    };
  }

  const forecasts = forecastsForSamples(analysis.samples);
  const aggregates = buildWeatherAggregates(forecasts, analysis.samples);
  const modelsAvailable = new Set(forecasts.map((f) => f.source.modelId)).size;

  const anyModelFailed = analysis.modelStatus.some((m) => !m.succeeded);
  const anySegmentMissingWeather = segmentFeatures.some((s) => s.weather.availability === "unavailable");
  const availability: RouteWeatherFeatures["availability"] =
    forecasts.length === 0 ? "unavailable" : anyModelFailed || anySegmentMissingWeather ? "partial" : "complete";

  const alertTypes = Array.from(new Set(analysis.alerts.map((a) => a.alertType)));
  const freezingRelatedAlert = analysis.alerts.some((a) => isFreezingRelatedAlert(a.title));

  const { notablePrecipitationMm } = riskModelV0Config.weather;
  const notableWeatherExposureShare = segmentFeatures.reduce((sum, segment) => {
    if (segment.weather.availability !== "available") return sum;
    const isNotable =
      segment.weather.snowfallPresent ||
      (segment.weather.maxPrecipitationMm ?? 0) >= notablePrecipitationMm ||
      segment.weather.belowFreezingTemperature;
    return isNotable ? sum + (segment.routeDurationShare ?? 0) : sum;
  }, 0);

  return {
    availability,
    modelsAvailable,
    samplePointCount: analysis.samples.length,
    ...aggregates,
    relevantAlertCount: analysis.alerts.length,
    alertTypes,
    freezingRelatedAlert,
    notableWeatherExposureShare,
  };
}

