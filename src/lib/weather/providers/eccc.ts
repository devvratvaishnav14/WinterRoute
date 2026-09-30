const ALERTS_URL = "https://api.weather.gc.ca/collections/weather-alerts/items";

export class EcccRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "EcccRequestError";
  }
}

/** Only the schema fields WinterRoute actually uses — confirmed against the live collection schema, not guessed. */
export interface EcccAlertFeature {
  id: string;
  type: "Feature";
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
  properties: {
    alert_type?: string;
    alert_name_en?: string;
    alert_text_en?: string;
    risk_colour_en?: string;
    publication_datetime?: string;
    validity_datetime?: string;
    expiration_datetime?: string;
    event_end_datetime?: string;
    feature_name_en?: string;
    province?: string;
    status_en?: string;
  };
}

export interface FetchEcccAlertsParams {
  /** [minLongitude, minLatitude, maxLongitude, maxLatitude] — EPSG:4326, per the OGC API bbox parameter. */
  bbox: [number, number, number, number];
  signal?: AbortSignal;
}

/**
 * Fetches active/recent alert features intersecting a bounding box around
 * the route. Uses the API's own spatial filtering (`bbox`) rather than
 * fetching all of Canada and filtering client-side.
 */
export async function fetchEcccAlerts({ bbox, signal }: FetchEcccAlertsParams): Promise<EcccAlertFeature[]> {
  const url = new URL(ALERTS_URL);
  url.searchParams.set("bbox", bbox.join(","));
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", "50");

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new EcccRequestError(`ECCC weather-alerts request failed (${response.status})`, response.status);
  }

  const data = (await response.json()) as { features?: EcccAlertFeature[] };
  return data.features ?? [];
}
