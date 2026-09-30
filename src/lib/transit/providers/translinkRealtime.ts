import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type Long from "long";
import { getTranslinkApiKey } from "../config";

const { transit_realtime } = GtfsRealtimeBindings;

/**
 * TransLink's current GTFS-Realtime V3 feeds — confirmed live against the
 * real API (not the retired RTTI API). Each is a standalone protobuf
 * `FeedMessage` covering the whole system; there is no per-route or
 * per-stop query parameter, which is exactly why these are fetched once
 * per cache window and matched locally rather than queried per segment
 * (see `getGtfsRealtimeFeeds.ts` for the caching/quota strategy).
 */
const TRIP_UPDATES_URL = "https://gtfsapi.translink.ca/v3/gtfsrealtime";
const VEHICLE_POSITIONS_URL = "https://gtfsapi.translink.ca/v3/gtfsposition";
const SERVICE_ALERTS_URL = "https://gtfsapi.translink.ca/v3/gtfsalerts";

export class TranslinkRealtimeRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslinkRealtimeRequestError";
  }
}

async function fetchFeedMessage(url: string, signal?: AbortSignal) {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("apikey", getTranslinkApiKey());

  const response = await fetch(requestUrl, { signal });
  if (!response.ok) {
    // The API key itself must never appear in a thrown error message (it
    // could end up in a log) — only the path/status are included.
    throw new TranslinkRealtimeRequestError(`TransLink realtime request to ${url.split("?")[0]} failed (${response.status})`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  return transit_realtime.FeedMessage.decode(buffer);
}

function hasField(message: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(message, field);
}

function headerTimestampToDate(header: { timestamp?: number | Long | null }): Date | undefined {
  if (header.timestamp == null) return undefined;
  const seconds = typeof header.timestamp === "number" ? header.timestamp : Number(header.timestamp);
  return new Date(seconds * 1000);
}

export type TranslinkTripScheduleRelationship =
  | "SCHEDULED"
  | "ADDED"
  | "UNSCHEDULED"
  | "CANCELED"
  | "REPLACEMENT"
  | "DUPLICATED"
  | "DELETED"
  | "NEW";

// Confirmed via library reflection + a live decode against the real feed
// (see docs/data-sources.md) — not guessed from the spec alone.
const TRIP_SCHEDULE_RELATIONSHIP: Record<number, TranslinkTripScheduleRelationship> = {
  0: "SCHEDULED",
  1: "ADDED",
  2: "UNSCHEDULED",
  3: "CANCELED",
  5: "REPLACEMENT",
  6: "DUPLICATED",
  7: "DELETED",
  8: "NEW",
};

export type TranslinkStopScheduleRelationship = "SCHEDULED" | "SKIPPED" | "NO_DATA" | "UNSCHEDULED";

const STOP_SCHEDULE_RELATIONSHIP: Record<number, TranslinkStopScheduleRelationship> = {
  0: "SCHEDULED",
  1: "SKIPPED",
  2: "NO_DATA",
  3: "UNSCHEDULED",
};

export type TranslinkVehicleStopStatus = "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";

const VEHICLE_STOP_STATUS: Record<number, TranslinkVehicleStopStatus> = {
  0: "INCOMING_AT",
  1: "STOPPED_AT",
  2: "IN_TRANSIT_TO",
};

export interface TranslinkStopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  /** Absent from the wire (no per-stop override) means SCHEDULED — GTFS-RT's own declared default, not an assumption made here. */
  scheduleRelationship: TranslinkStopScheduleRelationship;
  arrivalDelaySeconds?: number;
  arrivalTime?: Date;
  departureDelaySeconds?: number;
  departureTime?: Date;
}

export interface TranslinkTripUpdate {
  tripId?: string;
  routeId?: string;
  startDate?: string;
  scheduleRelationship: TranslinkTripScheduleRelationship;
  stopTimeUpdates: TranslinkStopTimeUpdate[];
}

export interface TranslinkVehiclePosition {
  tripId?: string;
  routeId?: string;
  vehicleId?: string;
  latitude?: number;
  longitude?: number;
  currentStopSequence?: number;
  currentStatus?: TranslinkVehicleStopStatus;
  /** The vehicle's own reported observation time — the basis for freshness/staleness, never assumed to equal "now." */
  observedAt?: Date;
}

export interface TranslinkAlertEntity {
  agencyId?: string;
  routeId?: string;
  tripId?: string;
  stopId?: string;
}

export interface TranslinkAlertActivePeriod {
  start?: Date;
  end?: Date;
}

export interface TranslinkAlert {
  id: string;
  /** Raw proto enum name (e.g. "STRIKE", "UNKNOWN_CAUSE") — normalized in `alerts.ts`. */
  cause?: string;
  effect?: string;
  headerText: string;
  descriptionText: string;
  url?: string;
  activePeriods: TranslinkAlertActivePeriod[];
  informedEntities: TranslinkAlertEntity[];
}

export interface TranslinkFeed<T> {
  headerTimestamp?: Date;
  entities: T[];
}

function firstTranslation(translated?: { translation?: Array<{ text?: string | null }> | null } | null): string {
  return translated?.translation?.[0]?.text ?? "";
}

/** Fetches and decodes TransLink's Trip Updates feed (GTFS-Realtime V3). */
export async function fetchTripUpdates(signal?: AbortSignal): Promise<TranslinkFeed<TranslinkTripUpdate>> {
  const feed = await fetchFeedMessage(TRIP_UPDATES_URL, signal);

  const entities: TranslinkTripUpdate[] = [];
  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    if (!tu) continue;

    const scheduleRelationship =
      tu.trip && hasField(tu.trip, "scheduleRelationship")
        ? (TRIP_SCHEDULE_RELATIONSHIP[tu.trip.scheduleRelationship as number] ?? "SCHEDULED")
        : "SCHEDULED";

    const stopTimeUpdates: TranslinkStopTimeUpdate[] = (tu.stopTimeUpdate ?? []).map((stu) => ({
      stopSequence: hasField(stu, "stopSequence") ? (stu.stopSequence ?? undefined) : undefined,
      stopId: hasField(stu, "stopId") ? (stu.stopId ?? undefined) : undefined,
      scheduleRelationship: hasField(stu, "scheduleRelationship")
        ? (STOP_SCHEDULE_RELATIONSHIP[stu.scheduleRelationship as number] ?? "SCHEDULED")
        : "SCHEDULED",
      arrivalDelaySeconds:
        stu.arrival && hasField(stu.arrival, "delay") ? (stu.arrival.delay ?? undefined) : undefined,
      arrivalTime:
        stu.arrival && hasField(stu.arrival, "time") && stu.arrival.time != null
          ? new Date(Number(stu.arrival.time) * 1000)
          : undefined,
      departureDelaySeconds:
        stu.departure && hasField(stu.departure, "delay") ? (stu.departure.delay ?? undefined) : undefined,
      departureTime:
        stu.departure && hasField(stu.departure, "time") && stu.departure.time != null
          ? new Date(Number(stu.departure.time) * 1000)
          : undefined,
    }));

    entities.push({
      tripId: tu.trip?.tripId ?? undefined,
      routeId: tu.trip?.routeId ?? undefined,
      startDate: tu.trip?.startDate ?? undefined,
      scheduleRelationship,
      stopTimeUpdates,
    });
  }

  return { headerTimestamp: headerTimestampToDate(feed.header), entities };
}

/** Fetches and decodes TransLink's Vehicle Positions feed (GTFS-Realtime V3). Confirmed live that `occupancy_status`/`occupancy_percentage` are never present on the wire — see docs/data-sources.md; not represented here at all. */
export async function fetchVehiclePositions(signal?: AbortSignal): Promise<TranslinkFeed<TranslinkVehiclePosition>> {
  const feed = await fetchFeedMessage(VEHICLE_POSITIONS_URL, signal);

  const entities: TranslinkVehiclePosition[] = [];
  for (const entity of feed.entity) {
    const v = entity.vehicle;
    if (!v || !v.position) continue;

    entities.push({
      tripId: v.trip?.tripId ?? undefined,
      routeId: v.trip?.routeId ?? undefined,
      vehicleId: v.vehicle?.id ?? undefined,
      latitude: v.position.latitude ?? undefined,
      longitude: v.position.longitude ?? undefined,
      currentStopSequence: hasField(v, "currentStopSequence") ? (v.currentStopSequence ?? undefined) : undefined,
      currentStatus: hasField(v, "currentStatus")
        ? (VEHICLE_STOP_STATUS[v.currentStatus as number] ?? undefined)
        : undefined,
      observedAt: hasField(v, "timestamp") && v.timestamp != null ? new Date(Number(v.timestamp) * 1000) : undefined,
    });
  }

  return { headerTimestamp: headerTimestampToDate(feed.header), entities };
}

/** Fetches and decodes TransLink's Service Alerts feed (GTFS-Realtime V3). */
export async function fetchServiceAlerts(signal?: AbortSignal): Promise<TranslinkFeed<TranslinkAlert>> {
  const feed = await fetchFeedMessage(SERVICE_ALERTS_URL, signal);

  const entities: TranslinkAlert[] = [];
  for (const entity of feed.entity) {
    const alert = entity.alert;
    if (!alert) continue;

    const activePeriods: TranslinkAlertActivePeriod[] = (alert.activePeriod ?? []).map((period) => ({
      start: hasField(period, "start") && period.start != null ? new Date(Number(period.start) * 1000) : undefined,
      end: hasField(period, "end") && period.end != null ? new Date(Number(period.end) * 1000) : undefined,
    }));

    const informedEntities: TranslinkAlertEntity[] = (alert.informedEntity ?? []).map((ie) => ({
      agencyId: ie.agencyId ?? undefined,
      routeId: ie.routeId ?? undefined,
      tripId: ie.trip?.tripId ?? undefined,
      stopId: ie.stopId ?? undefined,
    }));

    entities.push({
      id: entity.id,
      cause: alert.cause != null ? transit_realtime.Alert.Cause[alert.cause] : undefined,
      effect: alert.effect != null ? transit_realtime.Alert.Effect[alert.effect] : undefined,
      headerText: firstTranslation(alert.headerText),
      descriptionText: firstTranslation(alert.descriptionText),
      url: alert.url ? firstTranslation(alert.url) || undefined : undefined,
      activePeriods,
      informedEntities,
    });
  }

  return { headerTimestamp: headerTimestampToDate(feed.header), entities };
}
