import { getGoogleMapsApiKey } from "./config";
import { decodePolyline } from "./polyline";
import type { GoogleLatLng } from "./routes";

const COMPUTE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export class GoogleTrafficRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GoogleTrafficRequestError";
  }
}

export class GoogleTrafficRouteNotFoundError extends Error {
  constructor() {
    super("Google Routes returned no traffic-aware route for this trip.");
    this.name = "GoogleTrafficRouteNotFoundError";
  }
}

export type GoogleSpeedCondition = "NORMAL" | "SLOW" | "TRAFFIC_JAM";

export interface GoogleSpeedReadingInterval {
  startPolylinePointIndex: number;
  endPolylinePointIndex: number;
  speed: GoogleSpeedCondition;
}

export interface GoogleTrafficAwareResult {
  /** Traffic-aware duration, in seconds — Google's `duration` field under TRAFFIC_AWARE_OPTIMAL. */
  durationSeconds: number;
  /** Duration without traffic — Google's own `staticDuration`. Kept distinct from WinterRoute's own baseline; see docs/architecture.md. */
  staticDurationSeconds: number;
  distanceMeters: number;
  speedIntervals: GoogleSpeedReadingInterval[];
  /**
   * Decoded polyline for *this specific* traffic-aware response — not
   * assumed identical to the baseline route's geometry (a different
   * `routingPreference` can in principle choose a different path).
   * `speedIntervals` indexes into this exact polyline, which is what lets
   * WinterRoute compute real distance-weighted traffic proportions rather
   * than a cruder point-count approximation — see
   * `lib/traffic/transform.ts`.
   */
  polyline: GoogleLatLng[];
}

export interface FetchTrafficAwareRouteParams {
  originLatLng: GoogleLatLng;
  destinationLatLng: GoogleLatLng;
  /** RFC 3339. Always required here — traffic-aware analysis is inherently about a specific time. */
  departureTime: string;
  signal?: AbortSignal;
}

/**
 * Request only what traffic analysis needs — no step-level breakdown (the
 * existing baseline route from `lib/google/routes.ts` already has that;
 * this call exists purely to compare against it). `TRAFFIC_AWARE_OPTIMAL`
 * is used deliberately over `TRAFFIC_AWARE`: Google's own docs describe
 * `TRAFFIC_AWARE` as applying "optimizations... to significantly reduce
 * latency" versus `TRAFFIC_AWARE_OPTIMAL`'s "without applying most
 * performance optimizations" — i.e. `TRAFFIC_AWARE` trades accuracy for
 * speed. WinterRoute prefers accuracy for a once-per-submission analysis
 * (see docs/architecture.md "Google traffic-aware routing choice").
 * `TRAFFIC_ON_POLYLINE` (`extraComputations`) is what's billed at a
 * higher rate than basic routing — see docs/data-sources.md.
 */
const FIELD_MASK = [
  "routes.duration",
  "routes.staticDuration",
  "routes.distanceMeters",
  "routes.travelAdvisory.speedReadingIntervals",
  "routes.polyline.encodedPolyline",
].join(",");

export async function fetchTrafficAwareRoute(
  params: FetchTrafficAwareRouteParams,
): Promise<GoogleTrafficAwareResult> {
  const body = {
    origin: { location: { latLng: params.originLatLng } },
    destination: { location: { latLng: params.destinationLatLng } },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    trafficModel: "BEST_GUESS",
    departureTime: params.departureTime,
    extraComputations: ["TRAFFIC_ON_POLYLINE"],
    units: "METRIC",
  };

  const response = await fetch(COMPUTE_ROUTES_URL, {
    method: "POST",
    signal: params.signal,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleMapsApiKey(),
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error(`[google/trafficRoutes] computeRoutes ${response.status}:`, errorBody);
    throw new GoogleTrafficRequestError(
      `Traffic-aware computeRoutes request failed (${response.status})`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    routes?: Array<{
      duration?: string;
      staticDuration?: string;
      distanceMeters?: number;
      travelAdvisory?: { speedReadingIntervals?: GoogleSpeedReadingInterval[] };
      polyline?: { encodedPolyline?: string };
    }>;
  };

  const route = data.routes?.[0];
  if (!route) {
    throw new GoogleTrafficRouteNotFoundError();
  }

  const parseSeconds = (value: string | undefined): number => {
    if (!value) return 0;
    const match = /^(\d+)s$/.exec(value);
    return match ? Number(match[1]) : 0;
  };

  return {
    durationSeconds: parseSeconds(route.duration),
    staticDurationSeconds: parseSeconds(route.staticDuration),
    distanceMeters: route.distanceMeters ?? 0,
    speedIntervals: route.travelAdvisory?.speedReadingIntervals ?? [],
    polyline: route.polyline?.encodedPolyline ? decodePolyline(route.polyline.encodedPolyline) : [],
  };
}
