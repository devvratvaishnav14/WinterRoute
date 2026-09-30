import type { Route } from "@/lib/route/types";
import type { TimePreference } from "@/lib/trip/types";
import type { RouteWeatherAnalysis, WeatherAlert, WeatherForecastPoint, WeatherModelSource, RouteWeatherSample, RouteWeatherSamplePoint } from "@/lib/weather/types";
import { throwApiError } from "./apiError";

export interface AnalyzeWeatherRequest {
  route: Route;
  timePreference: TimePreference;
  dateTime: Date;
}

type RawModelSource = Omit<WeatherModelSource, "retrievedAt"> & { retrievedAt: string };
type RawForecastPoint = Omit<WeatherForecastPoint, "validTime" | "source"> & {
  validTime: string;
  source: RawModelSource;
};
type RawSamplePoint = Omit<RouteWeatherSamplePoint, "estimatedTime"> & { estimatedTime: string };
type RawSample = Omit<RouteWeatherSample, "point" | "forecasts"> & {
  point: RawSamplePoint;
  forecasts: RawForecastPoint[];
};
type RawAlert = Omit<WeatherAlert, "issuedAt" | "effectiveAt" | "expiresAt"> & {
  issuedAt?: string;
  effectiveAt?: string;
  expiresAt?: string;
};
type RawAnalysis = Omit<RouteWeatherAnalysis, "analyzedAt" | "tripDateTime" | "samples" | "alerts"> & {
  analyzedAt: string;
  tripDateTime: string;
  samples: RawSample[];
  alerts: RawAlert[];
};

function toDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function reviveAnalysis(raw: RawAnalysis): RouteWeatherAnalysis {
  return {
    ...raw,
    analyzedAt: new Date(raw.analyzedAt),
    tripDateTime: new Date(raw.tripDateTime),
    samples: raw.samples.map((sample) => ({
      ...sample,
      point: { ...sample.point, estimatedTime: new Date(sample.point.estimatedTime) },
      forecasts: sample.forecasts.map((forecast) => ({
        ...forecast,
        validTime: new Date(forecast.validTime),
        source: { ...forecast.source, retrievedAt: new Date(forecast.source.retrievedAt) },
      })),
    })),
    alerts: raw.alerts.map((alert) => ({
      ...alert,
      issuedAt: toDate(alert.issuedAt),
      effectiveAt: toDate(alert.effectiveAt),
      expiresAt: toDate(alert.expiresAt),
    })),
  };
}

export async function analyzeWeather(
  request: AnalyzeWeatherRequest,
  signal?: AbortSignal,
): Promise<RouteWeatherAnalysis> {
  const response = await fetch("/api/weather/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route: request.route,
      timePreference: request.timePreference,
      dateTime: request.dateTime.toISOString(),
    }),
    signal,
  });

  if (!response.ok) return throwApiError(response);

  const data = (await response.json()) as { analysis: RawAnalysis };
  return reviveAnalysis(data.analysis);
}
