import type { Route } from "@/lib/route/types";
import type { TimePreference, TransportMode } from "@/lib/trip/types";
import type { LatLng } from "@/lib/geo/geometry";
import { fetchTrafficAwareRoute, GoogleTrafficRequestError, GoogleTrafficRouteNotFoundError } from "@/lib/google/trafficRoutes";
import { fetchDriveBcEvents } from "./providers/driveBC";
import { buildTrafficAnalysis } from "./transform";
import { selectRelevantRoadEvents } from "./roadEvents";
import { resolveTrafficDepartureTime } from "./timeline";
import { getOrFetch } from "@/lib/cache/requestCache";
import type { RouteTrafficResult, TrafficAnalysisResult } from "./types";

export interface AnalyzeRouteTrafficParams {
  route: Route;
  mode: TransportMode;
  timePreference: TimePreference;
  tripDateTime: Date;
  signal?: AbortSignal;
}

/** Google traffic-aware routing only applies to DRIVE — see docs/architecture.md "Not all modes are drive." */
const TRAFFIC_ANALYZED_MODES: TransportMode[] = ["car"];

const NOT_APPLICABLE_REASONS: Partial<Record<TransportMode, string>> = {
  walk: "Direct road-traffic duration is not calculated for this travel mode.",
  cycle: "Direct road-traffic duration is not calculated for this travel mode yet.",
  bus: "Bus road-traffic delay is not calculated separately from the baseline yet — see docs/architecture.md.",
  train: "Rail segments are not directly affected by road traffic.",
};

const TRAFFIC_CACHE_TTL_MS = 2 * 60 * 1000; // near-term-sensitive — kept short

/**
 * Google rejects `departureTime` unless it's strictly in the future at
 * the moment Google itself processes the request — confirmed empirically
 * that sending our own `analyzedAt` (this server's "now" at the start of
 * the request) is not sufficient on its own: by the time the request
 * reaches Google, network latency and any clock skew between the two
 * servers can put it at or behind Google's own clock, and Google returns
 * "Timestamp must be set to a future time." This buffer is a plain
 * network-timing safety margin, not a business concept.
 */
const DEPARTURE_TIME_SAFETY_BUFFER_MS = 15_000;
const ROAD_EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const ROAD_EVENT_BBOX_PADDING_DEGREES = 0.03; // ~3km

function routePath(route: Route): LatLng[] {
  return route.segments.flatMap((segment) => segment.geometry ?? [segment.start, segment.end]);
}

function computeBoundingBox(points: LatLng[]): [number, number, number, number] {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  return [
    Math.min(...lngs) - ROAD_EVENT_BBOX_PADDING_DEGREES,
    Math.min(...lats) - ROAD_EVENT_BBOX_PADDING_DEGREES,
    Math.max(...lngs) + ROAD_EVENT_BBOX_PADDING_DEGREES,
    Math.max(...lats) + ROAD_EVENT_BBOX_PADDING_DEGREES,
  ];
}

/**
 * Builds the full traffic picture for a trip: a Google traffic-aware
 * analysis for DRIVE trips only, and DriveBC road events checked against
 * the route's real geometry for every mode. Each source fails
 * independently — see docs/architecture.md "Partial provider failure
 * (traffic)."
 */
export async function analyzeRouteTraffic(params: AnalyzeRouteTrafficParams): Promise<RouteTrafficResult> {
  const { route, mode, timePreference, tripDateTime, signal } = params;
  const analyzedAt = new Date();
  const path = routePath(route);

  const trafficAnalysis = await computeTrafficAnalysis({ route, mode, timePreference, tripDateTime, analyzedAt, signal });

  let roadEvents: RouteTrafficResult["roadEvents"] = [];
  let roadEventStatus: RouteTrafficResult["roadEventStatus"] = "ok";

  if (path.length > 0) {
    try {
      const bbox = computeBoundingBox(path);
      const cacheKey = `drivebc:${bbox.map((n) => n.toFixed(2)).join(",")}`;
      const events = await getOrFetch(cacheKey, ROAD_EVENTS_CACHE_TTL_MS, () => fetchDriveBcEvents({ bbox, signal }));
      // Road-event relevance is checked against the trip's actual commute
      // time when we have one (from the traffic analysis), falling back
      // to "now" only when no departure time could be resolved at all.
      const tripTime =
        trafficAnalysis.status === "analyzed" ? trafficAnalysis.analysis.commuteDepartureTime : tripDateTime;
      roadEvents = selectRelevantRoadEvents(events, path, tripTime);
    } catch {
      roadEventStatus = "unavailable";
    }
  } else {
    roadEventStatus = "unavailable";
  }

  return { trafficAnalysis, roadEvents, roadEventStatus };
}

async function computeTrafficAnalysis(params: {
  route: Route;
  mode: TransportMode;
  timePreference: TimePreference;
  tripDateTime: Date;
  analyzedAt: Date;
  signal?: AbortSignal;
}): Promise<TrafficAnalysisResult> {
  const { route, mode, timePreference, tripDateTime, analyzedAt, signal } = params;

  if (!TRAFFIC_ANALYZED_MODES.includes(mode)) {
    return {
      status: "not-applicable",
      reason: NOT_APPLICABLE_REASONS[mode] ?? "Traffic analysis is not available for this travel mode.",
    };
  }

  const departure = resolveTrafficDepartureTime(route, timePreference, tripDateTime);
  if (!departure || route.baselineDurationMinutes == null) {
    return { status: "unavailable", reason: "No baseline route duration available to compare against." };
  }

  // A non-transit "Arrive by" trip whose arrival time is close to "now"
  // (closer than the route's own baseline duration) produces a nominal
  // departure that's already in the past by the time this request
  // actually reaches Google — which correctly rejects it ("Timestamp must
  // be set to a future time," confirmed via a real failing request while
  // building this). Caught here, before spending an API call on a request
  // that's guaranteed to fail, with an honest explanation rather than a
  // generic provider error.
  //
  // `analyzedAt` is floored to the start of the current minute before
  // comparing — the same minute-precision issue already fixed once for
  // trip-form validation (see lib/trip/validation.ts): a "Leave at" time
  // is minute-precision (seconds always :00), so comparing it against a
  // full-precision "now" a few seconds later would wrongly call an
  // untouched, still-valid selection "already passed."
  const flooredAnalyzedAtMs = Math.floor(analyzedAt.getTime() / 60_000) * 60_000;
  if (departure.departureTime.getTime() < flooredAnalyzedAtMs) {
    return {
      status: "unavailable",
      reason: departure.isNominal
        ? "The selected arrival time is too close to now for this trip's baseline duration to produce a meaningful traffic estimate."
        : "The selected departure time has already passed.",
    };
  }

  // The departure time passed the (minute-floored) past-check above, but
  // could still be behind `analyzedAt` plus enough headroom for Google to
  // consider it future by the time it actually processes the request —
  // see DEPARTURE_TIME_SAFETY_BUFFER_MS. Clamped forward only when
  // needed; a genuinely-future selection is sent as-is.
  const earliestAcceptableDepartureTime = new Date(analyzedAt.getTime() + DEPARTURE_TIME_SAFETY_BUFFER_MS);
  const effectiveDepartureTime =
    departure.departureTime.getTime() < earliestAcceptableDepartureTime.getTime()
      ? earliestAcceptableDepartureTime
      : departure.departureTime;

  try {
    const cacheKey = `traffic:${route.origin.latitude.toFixed(5)},${route.origin.longitude.toFixed(5)}:${route.destination.latitude.toFixed(5)},${route.destination.longitude.toFixed(5)}:${Math.round(effectiveDepartureTime.getTime() / 60_000)}`;

    const googleResult = await getOrFetch(cacheKey, TRAFFIC_CACHE_TTL_MS, () =>
      fetchTrafficAwareRoute({
        originLatLng: { latitude: route.origin.latitude, longitude: route.origin.longitude },
        destinationLatLng: { latitude: route.destination.latitude, longitude: route.destination.longitude },
        departureTime: effectiveDepartureTime.toISOString(),
        signal,
      }),
    );

    const analysis = buildTrafficAnalysis({
      googleResult,
      referenceBaselineDurationMinutes: route.baselineDurationMinutes,
      commuteDepartureTime: effectiveDepartureTime,
      isNominalDepartureTime: departure.isNominal,
      analyzedAt,
    });

    return { status: "analyzed", analysis };
  } catch (error) {
    if (error instanceof GoogleTrafficRequestError || error instanceof GoogleTrafficRouteNotFoundError) {
      return { status: "unavailable", reason: "Traffic-aware routing was unavailable for this trip." };
    }
    throw error;
  }
}
