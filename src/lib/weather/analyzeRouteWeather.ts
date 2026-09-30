import type { Route } from "@/lib/route/types";
import type { TimePreference } from "@/lib/trip/types";
import {
  fetchOpenMeteoModel,
  OPEN_METEO_MODELS,
  type OpenMeteoLocationResult,
  type OpenMeteoModelKey,
} from "./providers/openMeteo";
import { fetchEcccAlerts } from "./providers/eccc";
import { openMeteoResultToForecastPoint } from "./transform";
import { ecccFeatureToWeatherAlert, isAlertRelevantToRoute, isEcccAlertActive } from "./alerts";
import { summarizeEnsemble } from "./ensemble";
import { buildRouteWeatherSamples } from "./sampling";
import { resolveWeatherTimeline } from "./timeline";
import type { RouteWeatherAnalysis, RouteWeatherSample, WeatherAlert, WeatherForecastPoint, WeatherModelStatus } from "./types";

export interface AnalyzeRouteWeatherParams {
  route: Route;
  timePreference: TimePreference;
  tripDateTime: Date;
  signal?: AbortSignal;
}

/**
 * The Canadian slot tries HRDPS first (higher resolution, ~48h horizon —
 * see docs/data-sources.md) and falls back to RDPS for sample times
 * beyond that, per point. ECMWF and GFS are independent slots. This list
 * order matters: it's the fallback preference for the Canadian slot.
 */
const CANADIAN_MODEL_CANDIDATES: OpenMeteoModelKey[] = ["hrdps", "rdps"];
const OTHER_MODEL_KEYS: OpenMeteoModelKey[] = ["ecmwf", "gfs"];
const ALL_MODEL_KEYS: OpenMeteoModelKey[] = [...CANADIAN_MODEL_CANDIDATES, ...OTHER_MODEL_KEYS];

/** The "3 independent models" WinterRoute presents — Canadian (HRDPS/RDPS as one slot), ECMWF, GFS. */
const INDEPENDENT_MODEL_SLOTS = 1 + OTHER_MODEL_KEYS.length;

const ALERT_BBOX_PADDING_DEGREES = 0.05; // ~5km

function computeBoundingBox(
  points: Array<{ latitude: number; longitude: number }>,
): [number, number, number, number] {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  return [
    Math.min(...lngs) - ALERT_BBOX_PADDING_DEGREES,
    Math.min(...lats) - ALERT_BBOX_PADDING_DEGREES,
    Math.max(...lngs) + ALERT_BBOX_PADDING_DEGREES,
    Math.max(...lats) + ALERT_BBOX_PADDING_DEGREES,
  ];
}

/** Sizes the Open-Meteo request window to just cover the latest sample time, capped at Open-Meteo's own max. */
function computeForecastDays(samples: Array<{ estimatedTime: Date }>, now: Date): number {
  if (samples.length === 0) return 2;
  const latest = Math.max(...samples.map((s) => s.estimatedTime.getTime()));
  const hoursAhead = (latest - now.getTime()) / (1000 * 60 * 60);
  return Math.min(16, Math.max(2, Math.ceil(hoursAhead / 24) + 1));
}

export function isWeatherDataUnavailable(analysis: RouteWeatherAnalysis): boolean {
  return analysis.modelStatus.length > 0 && analysis.modelStatus.every((m) => !m.succeeded);
}

/**
 * Builds the factual weather foundation for a trip: samples the route in
 * space and time, queries three independent numerical models per sample
 * (preserving each model's value separately — never pre-averaged),
 * computes a transparent descriptive summary, and checks official ECCC
 * alerts against the route's real geometry. No risk score, confidence
 * percentage, or recommendation — see docs/architecture.md.
 *
 * Tolerant of partial provider failure by design: each model is fetched
 * independently (`Promise.allSettled`), and the alert check failing
 * doesn't block weather data or vice versa. See `modelStatus` and
 * `alertStatus` on the result for what actually succeeded.
 */
export async function analyzeRouteWeather(params: AnalyzeRouteWeatherParams): Promise<RouteWeatherAnalysis> {
  const { route, timePreference, tripDateTime, signal } = params;
  const analyzedAt = new Date();

  const timeline = resolveWeatherTimeline(route, timePreference, tripDateTime);
  const samplePoints = buildRouteWeatherSamples(timeline.segments);

  if (samplePoints.length === 0) {
    return {
      analyzedAt,
      timePreference,
      tripDateTime,
      usedNominalBaselineTimeline: timeline.usedNominalBaseline,
      samples: [],
      modelStatus: [],
      alerts: [],
      alertStatus: "unavailable",
    };
  }

  const points = samplePoints.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  const forecastDays = computeForecastDays(samplePoints, analyzedAt);

  const modelSettlements = await Promise.allSettled(
    ALL_MODEL_KEYS.map((key) => fetchOpenMeteoModel({ model: key, points, forecastDays, signal })),
  );

  const modelStatus: WeatherModelStatus[] = [];
  const resultsByModel = new Map<OpenMeteoModelKey, OpenMeteoLocationResult[]>();

  ALL_MODEL_KEYS.forEach((key, index) => {
    const settlement = modelSettlements[index];
    const info = OPEN_METEO_MODELS[key];
    if (settlement.status === "fulfilled") {
      resultsByModel.set(key, settlement.value);
      modelStatus.push({ modelId: info.modelId, displayName: info.displayName, succeeded: true });
    } else {
      modelStatus.push({
        modelId: info.modelId,
        displayName: info.displayName,
        succeeded: false,
        errorMessage: "This forecast source was unavailable.",
      });
    }
  });

  const samples: RouteWeatherSample[] = samplePoints.map((samplePoint, index) => {
    const forecasts: WeatherForecastPoint[] = [];

    for (const key of CANADIAN_MODEL_CANDIDATES) {
      const result = resultsByModel.get(key)?.[index];
      if (!result) continue;
      const point = openMeteoResultToForecastPoint({
        result,
        targetTime: samplePoint.estimatedTime,
        model: key,
        retrievedAt: analyzedAt,
      });
      if (point) {
        forecasts.push(point);
        break; // HRDPS covered it; don't also add RDPS for the same slot.
      }
    }

    for (const key of OTHER_MODEL_KEYS) {
      const result = resultsByModel.get(key)?.[index];
      if (!result) continue;
      const point = openMeteoResultToForecastPoint({
        result,
        targetTime: samplePoint.estimatedTime,
        model: key,
        retrievedAt: analyzedAt,
      });
      if (point) forecasts.push(point);
    }

    return {
      point: samplePoint,
      forecasts,
      ensemble: summarizeEnsemble(forecasts, INDEPENDENT_MODEL_SLOTS),
    };
  });

  let alerts: WeatherAlert[] = [];
  let alertStatus: "ok" | "unavailable" = "ok";
  try {
    const bbox = computeBoundingBox(points);
    const features = await fetchEcccAlerts({ bbox, signal });
    const active = features.filter((feature) => isEcccAlertActive(feature, analyzedAt));
    const converted = active
      .map(ecccFeatureToWeatherAlert)
      .filter((alert): alert is WeatherAlert => alert !== null);
    alerts = converted.filter((alert) => isAlertRelevantToRoute(alert, points));
  } catch {
    alertStatus = "unavailable";
  }

  return {
    analyzedAt,
    timePreference,
    tripDateTime,
    usedNominalBaselineTimeline: timeline.usedNominalBaseline,
    samples,
    modelStatus,
    alerts,
    alertStatus,
  };
}
