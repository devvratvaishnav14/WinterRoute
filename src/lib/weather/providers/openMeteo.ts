const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export class OpenMeteoRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OpenMeteoRequestError";
  }
}

/**
 * The three independent numerical models WinterRoute preserves separately
 * (see docs/data-sources.md for why), plus the Canadian regional fallback
 * used once HRDPS's forecast horizon is exceeded. Model identifiers and
 * resolutions confirmed against the live API while building this — not
 * copied from documentation alone (`models=` accepts a specific string per
 * model; an invalid one is rejected with a 400, which is how the wrong
 * candidates from initial research were ruled out).
 */
export const OPEN_METEO_MODELS = {
  hrdps: {
    modelId: "cmc_gem_hrdps",
    displayName: "Canadian HRDPS",
    organization: "Environment and Climate Change Canada",
    resolutionKm: 2.5,
  },
  rdps: {
    modelId: "cmc_gem_rdps",
    displayName: "Canadian RDPS",
    organization: "Environment and Climate Change Canada",
    resolutionKm: 10,
  },
  ecmwf: {
    modelId: "ecmwf_ifs025",
    displayName: "ECMWF IFS",
    organization: "European Centre for Medium-Range Weather Forecasts",
    resolutionKm: 25,
  },
  gfs: {
    modelId: "ncep_gfs013",
    displayName: "NOAA GFS",
    organization: "NOAA / National Weather Service",
    resolutionKm: 13,
  },
} as const;

export type OpenMeteoModelKey = keyof typeof OPEN_METEO_MODELS;

const HOURLY_VARIABLES = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "rain",
  "snowfall",
  "precipitation_probability",
  "weather_code",
  "cloud_cover",
  "wind_speed_10m",
  "wind_gusts_10m",
  "visibility",
] as const;

export interface OpenMeteoHourly {
  time: string[];
  temperature_2m?: Array<number | null>;
  apparent_temperature?: Array<number | null>;
  precipitation?: Array<number | null>;
  rain?: Array<number | null>;
  snowfall?: Array<number | null>;
  precipitation_probability?: Array<number | null>;
  weather_code?: Array<number | null>;
  cloud_cover?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
  visibility?: Array<number | null>;
}

export interface OpenMeteoLocationResult {
  latitude: number;
  longitude: number;
  elevation?: number;
  hourly: OpenMeteoHourly;
}

export interface FetchOpenMeteoParams {
  model: OpenMeteoModelKey;
  points: Array<{ latitude: number; longitude: number }>;
  /** How many days of hourly data to request — covers WinterRoute's 72h window with margin. */
  forecastDays?: number;
  signal?: AbortSignal;
}

/**
 * Fetches one model's hourly forecast for a batch of coordinates in a
 * single request (Open-Meteo supports comma-separated lat/lon lists — see
 * docs/data-sources.md "Cost discipline"). Requested with `timezone=UTC`
 * explicitly so returned timestamps are unambiguous UTC instants (no
 * offset math, no DST guessing — see docs/architecture.md "Timezone
 * handling").
 */
export async function fetchOpenMeteoModel({
  model,
  points,
  forecastDays = 4,
  signal,
}: FetchOpenMeteoParams): Promise<OpenMeteoLocationResult[]> {
  if (points.length === 0) return [];

  const modelInfo = OPEN_METEO_MODELS[model];
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", points.map((p) => p.latitude.toFixed(5)).join(","));
  url.searchParams.set("longitude", points.map((p) => p.longitude.toFixed(5)).join(","));
  url.searchParams.set("hourly", HOURLY_VARIABLES.join(","));
  url.searchParams.set("models", modelInfo.modelId);
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", String(forecastDays));

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new OpenMeteoRequestError(`Open-Meteo request failed (${response.status})`, response.status);
  }

  const data = (await response.json()) as OpenMeteoLocationResult | OpenMeteoLocationResult[] | { error: true; reason?: string };

  if (!Array.isArray(data) && "error" in data && data.error) {
    throw new OpenMeteoRequestError(data.reason ?? "Open-Meteo returned an error", 400);
  }

  // A single-point request returns one object, not a one-element array.
  return Array.isArray(data) ? data : [data as OpenMeteoLocationResult];
}
