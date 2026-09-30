import type { SegmentTransportMode } from "@/lib/route/types";

/**
 * How confidently a real Google transit segment was matched to a specific
 * TransLink GTFS static trip. Never silently treated as certain — the
 * project brief is explicit that ambiguous matches must stay ambiguous,
 * not be resolved by picking one candidate arbitrarily. See
 * `lib/transit/matching.ts`.
 */
export type TransitMatchQuality = "exact" | "high-confidence" | "ambiguous" | "unmatched";

export interface GtfsRouteMatch {
  quality: TransitMatchQuality;
  routeId?: string;
  tripId?: string;
  serviceId?: string;
  /** Human-readable reasons contributing to the match/non-match — shown in the preview's expandable dev detail, never a raw GTFS row dump. */
  evidence: string[];
  /** Present only when `quality` is `"ambiguous"` — the other trip IDs that matched roughly as well and couldn't be distinguished. */
  ambiguousCandidateTripIds?: string[];
}

export interface TransitStopReference {
  providerStopId: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** Whether a vehicle's last known position is recent enough to present as current — see `lib/transit/vehiclePositions.ts`. */
export type TransitVehicleFreshness = "current" | "stale";

export interface TransitVehicleObservation {
  providerVehicleId?: string;
  latitude: number;
  longitude: number;
  observedAt: Date;
  freshness: TransitVehicleFreshness;
  currentStopSequence?: number;
  /** GTFS-RT `VehicleStopStatus` as a plain string (e.g. "IN_TRANSIT_TO") — see docs/architecture.md. */
  currentStatus?: string;
  tripId?: string;
}

/** GTFS-RT `TripDescriptor.ScheduleRelationship`, normalized — confirmed live that TransLink publishes both SCHEDULED and CANCELED. */
/** The full GTFS-RT `TripDescriptor.ScheduleRelationship` value space — live TransLink data was only observed to publish "scheduled" and "canceled", but the others are spec-legal and handled rather than assumed impossible. */
export type TransitTripStatus =
  | "scheduled"
  | "added"
  | "unscheduled"
  | "canceled"
  | "replacement"
  | "duplicated"
  | "deleted"
  | "new";

/** GTFS-RT `StopTimeUpdate.ScheduleRelationship`, normalized — confirmed live that TransLink publishes both SCHEDULED and SKIPPED. */
export type TransitStopStatus = "scheduled" | "skipped" | "noData" | "unscheduled";

/**
 * Realtime enrichment for a matched segment. Scheduled and realtime
 * values are kept as separate fields on purpose — see
 * docs/architecture.md "Static schedule vs. realtime, never overwritten."
 */
export interface TransitSegmentRealtime {
  tripStatus: TransitTripStatus;
  departureStopStatus?: TransitStopStatus;
  arrivalStopStatus?: TransitStopStatus;
  realtimeDeparture?: Date;
  realtimeArrival?: Date;
  departureDelaySeconds?: number;
  arrivalDelaySeconds?: number;
  vehicle?: TransitVehicleObservation;
}

/**
 * Whether the *segment's own* commute time is close enough that a
 * realtime update would plausibly exist yet. WinterRoute's own pragmatic
 * threshold (see `lib/transit/timeline.ts`), like the equivalent concept
 * for traffic — not a documented TransLink cutoff.
 */
export type TransitDataRecency = "near-term" | "future";

/**
 * Whether a matched segment actually has realtime enrichment. Never
 * conflated with "on time" — the absence of a Trip Update is represented
 * as `"matched-schedule-only"`, never smuggled in as a zero-delay
 * realtime value. See docs/architecture.md "No update ≠ on time."
 */
export type TransitSegmentStatus = "matched-with-realtime" | "matched-schedule-only" | "unmatched";

export interface TransitSegmentAnalysis {
  routeSegmentId: string;
  mode: Extract<SegmentTransportMode, "bus" | "rail">;
  lineShortName: string;
  status: TransitSegmentStatus;
  recency: TransitDataRecency;
  match: GtfsRouteMatch;
  originStop?: TransitStopReference;
  destinationStop?: TransitStopReference;
  scheduledDeparture?: Date;
  scheduledArrival?: Date;
  realtime?: TransitSegmentRealtime;
  relevantAlerts: TransitAlert[];
}

export type TransitAlertCause =
  | "unknown"
  | "otherCause"
  | "technicalProblem"
  | "strike"
  | "demonstration"
  | "accident"
  | "holiday"
  | "weather"
  | "maintenance"
  | "construction"
  | "policeActivity"
  | "medicalEmergency"
  | "specialEvent";

export type TransitAlertEffect =
  | "unknown"
  | "noService"
  | "reducedService"
  | "significantDelays"
  | "detour"
  | "additionalService"
  | "modifiedService"
  | "otherEffect"
  | "stopMoved"
  | "noEffect"
  | "accessibilityIssue";

export interface TransitAlertActivePeriod {
  start?: Date;
  end?: Date;
}

/**
 * Provider-neutral GTFS-RT service alert — only the fields WinterRoute
 * uses. Deliberately no severity→risk conversion — see
 * docs/architecture.md "Alert scope, not risk."
 */
export interface TransitAlert {
  provider: "translink";
  id: string;
  cause: TransitAlertCause;
  effect: TransitAlertEffect;
  headerText: string;
  descriptionText: string;
  activePeriods: TransitAlertActivePeriod[];
  url?: string;
  /** What GTFS-RT `informedEntity` this was matched on — for the dev detail view. */
  matchedOn: "route" | "trip" | "stop" | "agency";
}

export type TransitAnalysisStatus =
  | "not-applicable" // route has no bus/rail segments
  | "analyzed" // at least attempted for every transit segment (segments may individually be matched/unmatched)
  | "unavailable"; // GTFS static itself is unusable — nothing meaningful could be attempted

export interface TransitFeedStatus {
  gtfsStatic: "ok" | "unavailable";
  tripUpdates: "ok" | "unavailable";
  vehiclePositions: "ok" | "unavailable";
  serviceAlerts: "ok" | "unavailable";
}

export interface TransitAnalysis {
  status: TransitAnalysisStatus;
  reason?: string;
  provider: "translink";
  analyzedAt: Date;
  selectedTripTime: Date;
  transitSegments: TransitSegmentAnalysis[];
  /** Agency/system-wide alerts not tied to a specific matched segment. */
  systemAlerts: TransitAlert[];
  sourceStatus: TransitFeedStatus;
  /** Real feed header timestamps, when each source succeeded — see docs/architecture.md "Data freshness (transit)." */
  feedTimestamps: {
    gtfsStaticRetrievedAt?: Date;
    tripUpdatesHeaderTime?: Date;
    vehiclePositionsHeaderTime?: Date;
    serviceAlertsHeaderTime?: Date;
  };
}
