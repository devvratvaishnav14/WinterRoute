import type { TimePreference } from "@/lib/trip/types";

/**
 * Which independent numerical model a forecast came from. WinterRoute
 * treats "Canadian", "ECMWF", and "GFS" as three independent slots (see
 * docs/data-sources.md) — `modelId` is the specific model that actually
 * had data for a given point/time (e.g. the Canadian slot may be HRDPS
 * near departure and RDPS further out, once HRDPS's ~48h horizon is
 * exceeded — see docs/architecture.md "Weather integration").
 */
export interface WeatherModelSource {
  provider: "open-meteo";
  modelId: string;
  displayName: string;
  organization: string;
  /** Native grid resolution, where documented — informational only. */
  resolutionKm?: number;
  /** When WinterRoute retrieved this data. */
  retrievedAt: Date;
}

/**
 * One model's forecast for one point in space and time. Not every model
 * provides every variable — missing fields are `undefined`, never a
 * substituted `0` (a `0` means the model actually forecast zero of that
 * quantity). See docs/architecture.md "Missing data" for why this matters
 * for future model evaluation.
 *
 * Units are normalized across providers (documented in
 * `lib/weather/units.ts`): temperature in °C, precipitation/rain in mm,
 * snowfall in cm, wind in km/h, visibility in km.
 */
export interface WeatherForecastPoint {
  latitude: number;
  longitude: number;
  /** Elevation of the queried grid cell in metres, when the provider reports it. */
  elevationMeters?: number;
  validTime: Date;
  source: WeatherModelSource;
  temperatureC?: number;
  apparentTemperatureC?: number;
  precipitationMm?: number;
  rainMm?: number;
  snowfallCm?: number;
  precipitationProbabilityPercent?: number;
  /** WMO weather interpretation code — see `lib/weather/weatherCodes.ts`. */
  weatherCode?: number;
  weatherDescription?: string;
  cloudCoverPercent?: number;
  windSpeedKmh?: number;
  windGustsKmh?: number;
  visibilityKm?: number;
}

/** One location + estimated time along the trip's baseline timeline. */
export interface RouteWeatherSamplePoint {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  estimatedTime: Date;
  /** Which segment this sample belongs to/bounds, when it's not the overall origin/destination. */
  segmentId?: string;
}

/** Transparent, non-weighted descriptive statistics across whichever models had data — never a fabricated confidence score (see docs/architecture.md). */
export interface WeatherEnsembleSummary {
  modelsAttempted: number;
  modelsAvailable: number;
  temperatureC?: { median: number; min: number; max: number };
  precipitationMm?: { median: number; min: number; max: number; modelsPredicting: number };
  snowfallCm?: { median: number; min: number; max: number; modelsPredicting: number };
  windSpeedKmh?: { median: number; min: number; max: number };
}

/** All models' forecasts for one sample point, plus their descriptive summary. Individual model values are preserved, never collapsed into only an average — see docs/architecture.md "Model results stay separate." */
export interface RouteWeatherSample {
  point: RouteWeatherSamplePoint;
  forecasts: WeatherForecastPoint[];
  ensemble: WeatherEnsembleSummary;
}

export type WeatherAlertType = "warning" | "watch" | "advisory" | "statement" | "unknown";

/** A polygon or multipolygon in GeoJSON coordinate order ([longitude, latitude]), as ECCC provides it. */
export type WeatherAlertGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/** Provider-neutral representation of one official alert — only the fields WinterRoute uses, not a raw CAP payload. */
export interface WeatherAlert {
  provider: "eccc";
  id: string;
  alertType: WeatherAlertType;
  title: string;
  summary: string;
  severityColor?: string;
  issuedAt?: Date;
  effectiveAt?: Date;
  expiresAt?: Date;
  areaName?: string;
  province?: string;
  geometry?: WeatherAlertGeometry;
}

export interface WeatherModelStatus {
  modelId: string;
  displayName: string;
  succeeded: boolean;
  /** Safe, generic — never a raw provider error body. */
  errorMessage?: string;
}

/**
 * The factual weather-data foundation for a trip. Deliberately has no risk
 * score, confidence percentage, or recommendation fields — see
 * docs/architecture.md "No risk language in this stage."
 */
export interface RouteWeatherAnalysis {
  analyzedAt: Date;
  timePreference: TimePreference;
  tripDateTime: Date;
  /**
   * True only for a non-transit "Arrive by" trip, where sample times were
   * derived from a nominal baseline departure (arrival time minus baseline
   * duration) purely for weather-sampling purposes — NOT a recommended
   * departure time. See `lib/weather/timeline.ts`.
   */
  usedNominalBaselineTimeline: boolean;
  samples: RouteWeatherSample[];
  modelStatus: WeatherModelStatus[];
  alerts: WeatherAlert[];
  /** Distinguishes "checked, none relevant" from "couldn't check" — see docs/architecture.md. */
  alertStatus: "ok" | "unavailable";
}
