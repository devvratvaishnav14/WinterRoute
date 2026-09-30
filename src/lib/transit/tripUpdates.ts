import type {
  TranslinkStopScheduleRelationship,
  TranslinkTripScheduleRelationship,
  TranslinkTripUpdate,
} from "./providers/translinkRealtime";
import type { GtfsStop } from "./gtfsStatic/types";
import type { TransitSegmentRealtime, TransitStopStatus, TransitTripStatus } from "./types";

const TRIP_STATUS_MAP: Record<TranslinkTripScheduleRelationship, TransitTripStatus> = {
  SCHEDULED: "scheduled",
  ADDED: "added",
  UNSCHEDULED: "unscheduled",
  CANCELED: "canceled",
  REPLACEMENT: "replacement",
  DUPLICATED: "duplicated",
  DELETED: "deleted",
  NEW: "new",
};

const STOP_STATUS_MAP: Record<TranslinkStopScheduleRelationship, TransitStopStatus> = {
  SCHEDULED: "scheduled",
  SKIPPED: "skipped",
  NO_DATA: "noData",
  UNSCHEDULED: "unscheduled",
};

/** Indexes a Trip Updates feed by `trip_id` for direct lookup — the feed itself has no such index, and it's fetched/decoded once per cache window regardless of how many segments need to look a trip up in it. */
export function indexTripUpdatesByTripId(entities: TranslinkTripUpdate[]): Map<string, TranslinkTripUpdate> {
  const index = new Map<string, TranslinkTripUpdate>();
  for (const entity of entities) {
    if (entity.tripId) index.set(entity.tripId, entity);
  }
  return index;
}

/**
 * Builds a segment's realtime enrichment from the Trip Update TransLink
 * has actually published for its matched trip. Scheduled values (from
 * GTFS static, computed separately in `matching.ts`) are never touched
 * here — only realtime-sourced fields are set, so the two can never be
 * confused by a caller. A stop with no `StopTimeUpdate` entry at all in
 * the trip's list (as opposed to one present with `SCHEDULED`) still maps
 * to `scheduleRelationship`'s spec-default "scheduled" for that stop,
 * since a Trip Update need not repeat every stop for ones it has nothing
 * new to say about — but with no delay/time values, since none were
 * actually published for that stop.
 */
export function buildSegmentRealtime(
  tripUpdate: TranslinkTripUpdate,
  originStop: GtfsStop,
  destinationStop: GtfsStop,
): TransitSegmentRealtime {
  const departureUpdate = tripUpdate.stopTimeUpdates.find((s) => s.stopId === originStop.stop_id);
  const arrivalUpdate = tripUpdate.stopTimeUpdates.find((s) => s.stopId === destinationStop.stop_id);

  return {
    tripStatus: TRIP_STATUS_MAP[tripUpdate.scheduleRelationship],
    departureStopStatus: departureUpdate ? STOP_STATUS_MAP[departureUpdate.scheduleRelationship] : undefined,
    arrivalStopStatus: arrivalUpdate ? STOP_STATUS_MAP[arrivalUpdate.scheduleRelationship] : undefined,
    realtimeDeparture: departureUpdate?.departureTime ?? departureUpdate?.arrivalTime,
    realtimeArrival: arrivalUpdate?.arrivalTime ?? arrivalUpdate?.departureTime,
    departureDelaySeconds: departureUpdate?.departureDelaySeconds ?? departureUpdate?.arrivalDelaySeconds,
    arrivalDelaySeconds: arrivalUpdate?.arrivalDelaySeconds ?? arrivalUpdate?.departureDelaySeconds,
  };
}
