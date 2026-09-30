/**
 * Small synthetic-data builders shared by `lib/scoring/`'s test files —
 * not imported by any application code. Kept here (rather than
 * duplicated per test file) because nearly every scoring test needs a
 * `Route`/`RouteWeatherAnalysis`/`RouteTrafficResult`/`TransitAnalysis`
 * fixture, and the scoring layer's tests specifically care about
 * combinations of these (mode-sensitivity, counterfactual, missing-data
 * tests), which duplicated ad-hoc fixtures would make hard to keep
 * consistent.
 */
import type { ResolvedLocation, Route, RouteSegment } from "@/lib/route/types";
import type { RouteWeatherAnalysis, RouteWeatherSample, WeatherForecastPoint, WeatherModelSource } from "@/lib/weather/types";
import type { RouteTrafficResult, TrafficAnalysis } from "@/lib/traffic/types";
import type { TransitAnalysis, TransitSegmentAnalysis } from "@/lib/transit/types";

export function location(label: string, latitude = 49.28, longitude = -123.1): ResolvedLocation {
  return { label, latitude, longitude };
}

export function segment(overrides: Partial<RouteSegment> = {}): RouteSegment {
  return {
    id: "seg-1",
    mode: "walk",
    start: location("Start"),
    end: location("End"),
    durationMinutes: 10,
    distanceMeters: 800,
    startTime: new Date("2026-09-24T15:00:00Z"),
    endTime: new Date("2026-09-24T15:10:00Z"),
    ...overrides,
  };
}

export function route(segments: RouteSegment[], overrides: Partial<Route> = {}): Route {
  return {
    origin: segments[0]?.start ?? location("Origin"),
    destination: segments[segments.length - 1]?.end ?? location("Destination"),
    departureTime: segments[0]?.startTime,
    arrivalTime: segments[segments.length - 1]?.endTime,
    baselineDurationMinutes: segments.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0),
    totalDistanceMeters: segments.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0),
    segments,
    ...overrides,
  };
}

function modelSource(modelId: string): WeatherModelSource {
  return { provider: "open-meteo", modelId, displayName: modelId, organization: "Test", retrievedAt: new Date() };
}

export function forecast(overrides: Partial<WeatherForecastPoint> = {}): WeatherForecastPoint {
  return {
    latitude: 49.28,
    longitude: -123.1,
    validTime: new Date("2026-09-24T15:00:00Z"),
    source: modelSource("model-a"),
    temperatureC: 10,
    ...overrides,
  };
}

export function weatherSample(
  segmentId: string | undefined,
  forecasts: WeatherForecastPoint[],
  overrides: Partial<RouteWeatherSample["point"]> = {},
): RouteWeatherSample {
  return {
    point: {
      id: `${segmentId ?? "boundary"}-point`,
      latitude: 49.28,
      longitude: -123.1,
      label: "Point",
      estimatedTime: new Date("2026-09-24T15:00:00Z"),
      segmentId,
      ...overrides,
    },
    forecasts,
    ensemble: { modelsAttempted: forecasts.length, modelsAvailable: forecasts.length },
  };
}

export function weatherAnalysis(overrides: Partial<RouteWeatherAnalysis> = {}): RouteWeatherAnalysis {
  return {
    analyzedAt: new Date(),
    timePreference: "leaveAt",
    tripDateTime: new Date("2026-09-24T15:00:00Z"),
    usedNominalBaselineTimeline: false,
    samples: [],
    modelStatus: [{ modelId: "model-a", displayName: "Model A", succeeded: true }],
    alerts: [],
    alertStatus: "ok",
    ...overrides,
  };
}

export function trafficAnalysis(overrides: Partial<TrafficAnalysis> = {}): TrafficAnalysis {
  return {
    provider: "google-routes",
    analyzedAt: new Date(),
    commuteDepartureTime: new Date("2026-09-24T15:00:00Z"),
    isNominalDepartureTime: false,
    recency: "near-term",
    referenceBaselineDurationMinutes: 30,
    googleStaticDurationMinutes: 30,
    trafficAwareDurationMinutes: 30,
    trafficDelayMinutes: 0,
    trafficModel: "BEST_GUESS",
    distanceMeters: 10000,
    intervals: [],
    ...overrides,
  };
}

export function trafficResult(overrides: Partial<RouteTrafficResult> = {}): RouteTrafficResult {
  return {
    trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis() },
    roadEvents: [],
    roadEventStatus: "ok",
    ...overrides,
  };
}

export function transitSegmentAnalysis(overrides: Partial<TransitSegmentAnalysis> = {}): TransitSegmentAnalysis {
  return {
    routeSegmentId: "seg-1",
    mode: "bus",
    lineShortName: "099",
    status: "matched-schedule-only",
    recency: "future",
    match: { quality: "exact", routeId: "R1", tripId: "T1", serviceId: "S1", evidence: [] },
    relevantAlerts: [],
    ...overrides,
  };
}

export function transitAnalysis(overrides: Partial<TransitAnalysis> = {}): TransitAnalysis {
  return {
    status: "analyzed",
    provider: "translink",
    analyzedAt: new Date(),
    selectedTripTime: new Date("2026-09-24T15:00:00Z"),
    transitSegments: [],
    systemAlerts: [],
    sourceStatus: { gtfsStatic: "ok", tripUpdates: "ok", vehiclePositions: "ok", serviceAlerts: "ok" },
    feedTimestamps: {},
    ...overrides,
  };
}
