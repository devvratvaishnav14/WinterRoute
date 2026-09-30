import type { Route, RouteSegment } from "@/lib/route/types";
import type { TransportMode } from "@/lib/trip/types";
import { matchSegmentAlerts, matchSystemAlerts } from "./alerts";
import { getGtfsStaticStore } from "./gtfsStatic/getGtfsStaticStore";
import type { GtfsStaticStore } from "./gtfsStatic/store";
import type { GtfsStop } from "./gtfsStatic/types";
import { getServiceAlertsFeed, getTripUpdatesFeed, getVehiclePositionsFeed } from "./getRealtimeFeeds";
import { matchSegmentToGtfs } from "./matching";
import type { TranslinkAlert, TranslinkTripUpdate, TranslinkVehiclePosition } from "./providers/translinkRealtime";
import { buildSegmentRealtime, indexTripUpdatesByTripId } from "./tripUpdates";
import type {
  TransitAnalysis,
  TransitDataRecency,
  TransitFeedStatus,
  TransitSegmentAnalysis,
  TransitStopReference,
} from "./types";
import { findVehicleObservation } from "./vehiclePositions";

export interface AnalyzeRouteTransitParams {
  route: Route;
  mode: TransportMode;
  /** The trip's selected commute time — used as the reference instant for alert active-period overlap. Not a per-segment realtime cutoff (see `types.ts`). */
  tripDateTime: Date;
  signal?: AbortSignal;
}

/** Only these requested modes can ever produce Google transit (bus/rail) segments in the first place — checked before touching TransLink at all, to preserve quota for trips that could never have transit segments. */
const TRANSIT_REQUESTABLE_MODES: TransportMode[] = ["bus", "train"];

const NO_TRANSIT_SEGMENTS_REASON = "This trip has no bus or rail segments to analyze.";

function emptyFeedStatus(): TransitFeedStatus {
  return { gtfsStatic: "unavailable", tripUpdates: "unavailable", vehiclePositions: "unavailable", serviceAlerts: "unavailable" };
}

function notApplicable(reason: string, analyzedAt: Date, tripDateTime: Date): TransitAnalysis {
  return {
    status: "not-applicable",
    reason,
    provider: "translink",
    analyzedAt,
    selectedTripTime: tripDateTime,
    transitSegments: [],
    systemAlerts: [],
    sourceStatus: emptyFeedStatus(),
    feedTimestamps: {},
  };
}

function toStopReference(stop: GtfsStop): TransitStopReference {
  return { providerStopId: stop.stop_id, name: stop.stop_name, latitude: Number(stop.stop_lat), longitude: Number(stop.stop_lon) };
}

function analyzeSegment(
  segment: RouteSegment,
  store: GtfsStaticStore,
  tripUpdatesByTripId: Map<string, TranslinkTripUpdate>,
  vehicleEntities: TranslinkVehiclePosition[],
  alertEntities: TranslinkAlert[],
  analyzedAt: Date,
): TransitSegmentAnalysis {
  const { routeMatch, resolved } = matchSegmentToGtfs(segment, store);
  const lineShortName = segment.transitLine?.shortName ?? "";
  const mode = segment.mode === "rail" ? "rail" : "bus";

  if (!resolved || !routeMatch.tripId || !routeMatch.routeId) {
    return {
      routeSegmentId: segment.id,
      mode,
      lineShortName,
      status: "unmatched",
      // No trip was identified at all, so there's no realtime feed to have
      // checked evidence in — "future" here just means "no evidence
      // exists," not a chronological judgment about the segment's time.
      recency: "future",
      match: routeMatch,
      relevantAlerts: [],
    };
  }

  const { tripId, routeId } = routeMatch;
  const tripUpdate = tripUpdatesByTripId.get(tripId);

  // Evidence-based, per the explicit requirement: "near-term" means
  // TransLink is actually publishing a realtime update for this specific
  // trip right now, not "the departure time is within some assumed
  // window." No update found means no realtime evidence — reported
  // honestly as schedule-only, never as an assumed on-time delay of zero.
  const recency: TransitDataRecency = tripUpdate ? "near-term" : "future";

  const realtime = tripUpdate ? buildSegmentRealtime(tripUpdate, resolved.originStop, resolved.destinationStop) : undefined;

  if (realtime && recency === "near-term") {
    const vehicle = findVehicleObservation(vehicleEntities, tripId, analyzedAt);
    if (vehicle) realtime.vehicle = vehicle;
  }

  const relevantAlerts = matchSegmentAlerts(
    alertEntities,
    {
      routeId,
      tripId,
      originStopId: resolved.originStop.stop_id,
      destinationStopId: resolved.destinationStop.stop_id,
    },
    segment.startTime ?? analyzedAt,
  );

  return {
    routeSegmentId: segment.id,
    mode,
    lineShortName,
    status: tripUpdate ? "matched-with-realtime" : "matched-schedule-only",
    recency,
    match: routeMatch,
    originStop: toStopReference(resolved.originStop),
    destinationStop: toStopReference(resolved.destinationStop),
    scheduledDeparture: resolved.scheduledDeparture,
    scheduledArrival: resolved.scheduledArrival,
    realtime,
    relevantAlerts,
  };
}

/**
 * Enriches a Google-computed route's actual bus/rail segments with
 * TransLink GTFS static schedule + GTFS-Realtime data. Google remains the
 * source of the itinerary itself — this only adds schedule/realtime
 * context on top of segments Google already produced, and analyzes
 * whichever segments the real route actually has (not just the user's
 * originally-selected mode; a "Bus" request can resolve to a route with
 * both bus and SkyTrain segments, and both get analyzed).
 *
 * Non-transit requests return `not-applicable` before this function makes
 * any TransLink request at all — see `TRANSIT_REQUESTABLE_MODES` — which
 * is the quota-preservation guarantee described in
 * docs/architecture.md "Transit data pipeline."
 */
export async function analyzeRouteTransit(params: AnalyzeRouteTransitParams): Promise<TransitAnalysis> {
  const { route, mode, tripDateTime, signal } = params;
  const analyzedAt = new Date();

  const transitSegments = route.segments.filter((segment) => segment.mode === "bus" || segment.mode === "rail");

  if (!TRANSIT_REQUESTABLE_MODES.includes(mode) || transitSegments.length === 0) {
    return notApplicable(NO_TRANSIT_SEGMENTS_REASON, analyzedAt, tripDateTime);
  }

  const [staticResult, tripUpdatesResult, vehiclePositionsResult, alertsResult] = await Promise.allSettled([
    getGtfsStaticStore(signal),
    getTripUpdatesFeed(signal),
    getVehiclePositionsFeed(signal),
    getServiceAlertsFeed(signal),
  ]);

  const sourceStatus: TransitFeedStatus = {
    gtfsStatic: staticResult.status === "fulfilled" ? "ok" : "unavailable",
    tripUpdates: tripUpdatesResult.status === "fulfilled" ? "ok" : "unavailable",
    vehiclePositions: vehiclePositionsResult.status === "fulfilled" ? "ok" : "unavailable",
    serviceAlerts: alertsResult.status === "fulfilled" ? "ok" : "unavailable",
  };

  if (staticResult.status !== "fulfilled") {
    // Without GTFS static, no segment can be matched to a trip at all —
    // reporting "unavailable" (a source outage) rather than quietly
    // returning every segment as "unmatched" (which would look like a
    // matching failure rather than a fetch failure).
    return {
      status: "unavailable",
      reason: "TransLink's GTFS static schedule data was unavailable.",
      provider: "translink",
      analyzedAt,
      selectedTripTime: tripDateTime,
      transitSegments: [],
      systemAlerts: [],
      sourceStatus,
      feedTimestamps: {},
    };
  }

  const store = staticResult.value;
  const tripUpdatesByTripId =
    tripUpdatesResult.status === "fulfilled" ? indexTripUpdatesByTripId(tripUpdatesResult.value.entities) : new Map();
  const vehicleEntities = vehiclePositionsResult.status === "fulfilled" ? vehiclePositionsResult.value.entities : [];
  const alertEntities = alertsResult.status === "fulfilled" ? alertsResult.value.entities : [];

  const segmentAnalyses = transitSegments.map((segment) =>
    analyzeSegment(segment, store, tripUpdatesByTripId, vehicleEntities, alertEntities, analyzedAt),
  );

  return {
    status: "analyzed",
    provider: "translink",
    analyzedAt,
    selectedTripTime: tripDateTime,
    transitSegments: segmentAnalyses,
    systemAlerts: matchSystemAlerts(alertEntities, tripDateTime),
    sourceStatus,
    feedTimestamps: {
      gtfsStaticRetrievedAt: store.fetchedAt,
      tripUpdatesHeaderTime: tripUpdatesResult.status === "fulfilled" ? tripUpdatesResult.value.headerTimestamp : undefined,
      vehiclePositionsHeaderTime:
        vehiclePositionsResult.status === "fulfilled" ? vehiclePositionsResult.value.headerTimestamp : undefined,
      serviceAlertsHeaderTime: alertsResult.status === "fulfilled" ? alertsResult.value.headerTimestamp : undefined,
    },
  };
}
