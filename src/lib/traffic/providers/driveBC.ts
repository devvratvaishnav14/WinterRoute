const EVENTS_URL = "https://api.open511.gov.bc.ca/events";

export class DriveBcRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DriveBcRequestError";
  }
}

/** Only the Open511 fields WinterRoute uses — confirmed against real live events, not guessed. */
export interface Open511Event {
  id: string;
  headline?: string;
  status?: "ACTIVE" | "ARCHIVED" | string;
  created?: string;
  updated?: string;
  description?: string;
  /**
   * Interval strings like "2026-09-09T05:00/2026-10-01T20:00" — confirmed
   * to lack an explicit UTC offset in real responses (unlike `created`/
   * `updated`, which do have one). DriveBC's jurisdiction is
   * America/Vancouver, so these are treated as Vancouver local time — see
   * `lib/traffic/roadEvents.ts`.
   */
  schedule?: { intervals?: string[] };
  event_type?: "CONSTRUCTION" | "SPECIAL_EVENT" | "INCIDENT" | "WEATHER_CONDITION" | "ROAD_CONDITION" | string;
  event_subtypes?: string[];
  severity?: "MINOR" | "MODERATE" | "MAJOR" | "UNKNOWN" | string;
  geography?:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: Array<[number, number]> };
  roads?: Array<{ name?: string; from?: string; direction?: string }>;
}

export interface FetchDriveBcEventsParams {
  /** [minLongitude, minLatitude, maxLongitude, maxLatitude]. */
  bbox: [number, number, number, number];
  signal?: AbortSignal;
}

/** Fetches active/recent road events intersecting a bounding box around the route, using the API's own spatial filter. */
export async function fetchDriveBcEvents({ bbox, signal }: FetchDriveBcEventsParams): Promise<Open511Event[]> {
  const url = new URL(EVENTS_URL);
  url.searchParams.set("bbox", bbox.join(","));
  url.searchParams.set("status", "ACTIVE");
  url.searchParams.set("limit", "100");

  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new DriveBcRequestError(`DriveBC events request failed (${response.status})`, response.status);
  }

  const data = (await response.json()) as { events?: Open511Event[] };
  return data.events ?? [];
}
