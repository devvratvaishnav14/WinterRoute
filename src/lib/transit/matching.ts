import { haversineDistanceMeters } from "@/lib/geo/geometry";
import type { ResolvedLocation, RouteSegment } from "@/lib/route/types";
import { gtfsServiceDateTimeToDate, parseGtfsTimeToSeconds, previousServiceDate, serviceDateFor } from "./gtfsTime";
import type { GtfsStaticStore } from "./gtfsStatic/store";
import type { GtfsRoute, GtfsStop, GtfsStopTime, GtfsTrip } from "./gtfsStatic/types";
import type { GtfsRouteMatch, TransitMatchQuality } from "./types";

/**
 * How close a GTFS stop's coordinates must be to Google's segment
 * start/end point to be considered "the same stop." Wider than the road-
 * traffic proximity threshold (`ROAD_EVENT_PROXIMITY_METERS`, 300m) is not
 * appropriate here — a wrong-but-nearby stop is a real matching error, not
 * a near-miss — so this stays tighter: loose enough to absorb Google
 * placing its marker at a station entrance/plaza rather than the exact
 * platform coordinate, tight enough not to match the wrong stop across the
 * street. A pragmatic, documented, adjustable choice.
 */
export const STOP_MATCH_PROXIMITY_METERS = 150;

/**
 * How far Google's reported segment start time may differ from a
 * candidate trip's static scheduled departure and still be considered a
 * candidate at all. Google's own transit routing already accounts for
 * realtime conditions to some degree, so its estimate is not expected to
 * equal the static schedule exactly — this tolerance absorbs that, while
 * still being tight enough to reject a same-route trip an hour away.
 */
const DEPARTURE_TIME_MATCH_TOLERANCE_MINUTES = 12;

/** Within this margin of the best candidate's time difference, a second candidate is treated as a genuine ambiguity rather than silently discarded. */
const AMBIGUITY_MARGIN_MINUTES = 3;

/** Below this time difference, a match is reported as "exact" rather than merely "high-confidence" — see module doc comment on what distinguishes them. */
const EXACT_MATCH_TIME_TOLERANCE_MINUTES = 5;

interface StopTimeAtLocation {
  stopTime: GtfsStopTime;
  stop: GtfsStop;
  distanceMeters: number;
}

function findClosestStopTime(
  stopTimes: GtfsStopTime[],
  location: ResolvedLocation,
  store: GtfsStaticStore,
): StopTimeAtLocation | undefined {
  let best: StopTimeAtLocation | undefined;

  for (const stopTime of stopTimes) {
    const stop = store.stopById(stopTime.stop_id);
    if (!stop) continue;

    const distanceMeters = haversineDistanceMeters(location, {
      latitude: Number(stop.stop_lat),
      longitude: Number(stop.stop_lon),
    });

    if (distanceMeters <= STOP_MATCH_PROXIMITY_METERS && (!best || distanceMeters < best.distanceMeters)) {
      best = { stopTime, stop, distanceMeters };
    }
  }

  return best;
}

interface CandidateTripMatch {
  trip: GtfsTrip;
  route: GtfsRoute;
  serviceDate: string;
  originStop: GtfsStop;
  destinationStop: GtfsStop;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  timeDeltaMinutes: number;
}

/**
 * The resolved static-schedule detail for a confirmed (`exact` or
 * `high-confidence`) match — everything the realtime-enrichment step needs
 * (which stop IDs to look up in Trip Updates, what the static schedule
 * said) without re-scanning `stop_times.txt` a second time for the same
 * trip.
 */
export interface ResolvedGtfsSchedule {
  serviceDate: string;
  originStop: GtfsStop;
  destinationStop: GtfsStop;
  scheduledDeparture: Date;
  scheduledArrival: Date;
}

export interface SegmentGtfsMatch {
  routeMatch: GtfsRouteMatch;
  /** Present only when `routeMatch.quality` is `"exact"` or `"high-confidence"`. */
  resolved?: ResolvedGtfsSchedule;
}

function unmatched(evidence: string[]): SegmentGtfsMatch {
  return { routeMatch: { quality: "unmatched", evidence } };
}

/**
 * Matches one Google-derived `bus`/`rail` route segment against
 * TransLink's GTFS static schedule, using multiple corroborating signals
 * (route short name, stop proximity, stop ordering, and scheduled-time
 * closeness) rather than any single one. Never guesses among genuinely
 * indistinguishable candidates — see the "ambiguous" branch.
 */
export function matchSegmentToGtfs(segment: RouteSegment, store: GtfsStaticStore): SegmentGtfsMatch {
  if (segment.mode !== "bus" && segment.mode !== "rail") {
    return unmatched(["Segment mode is not bus or rail — GTFS matching does not apply."]);
  }

  const line = segment.transitLine;
  if (!line?.shortName && !line?.longName) {
    return unmatched(["Google provided neither a line short name nor a long name for this segment to match against GTFS."]);
  }

  if (!segment.startTime) {
    return unmatched(["Segment has no start time to match against a scheduled trip."]);
  }

  // SkyTrain/rail routes have no `route_short_name` at all in TransLink's
  // real GTFS feed (confirmed live — e.g. the Expo Line's is an empty
  // string) — only `route_long_name` identifies them, and it was
  // confirmed live to match Google's `transitLine.longName` exactly
  // ("Expo Line" in both). Bus routes always have a short name and use it
  // as the primary, more specific identifier.
  const identifierLabel = line.shortName ? "route_short_name" : "route_long_name";
  const identifierValue = line.shortName || line.longName;
  const candidateRoutes = line.shortName
    ? store.findRoutesByShortName(line.shortName)
    : store.findRoutesByLongName(line.longName);

  if (candidateRoutes.length === 0) {
    return unmatched([`No GTFS route found with ${identifierLabel} "${identifierValue}".`]);
  }

  const primaryServiceDate = serviceDateFor(segment.startTime);
  const priorServiceDate = previousServiceDate(primaryServiceDate);
  const activeOnPrimary = store.activeServiceIds(primaryServiceDate);
  const activeOnPrior = store.activeServiceIds(priorServiceDate);

  const candidateTrips: Array<{ trip: GtfsTrip; route: GtfsRoute; serviceDate: string }> = [];
  for (const route of candidateRoutes) {
    for (const trip of store.tripsForRoute(route.route_id)) {
      // Both interpretations are tried independently (not else-if) when a
      // service_id is active on both dates: a >24:00 trip belonging to the
      // *prior* service day can land in today's civil-time window (see
      // gtfsTime.ts), so a trip active on both dates needs both
      // interpretations checked — only the correct one will actually land
      // near the segment's start time once times are computed below, and
      // the other is filtered out by the time-tolerance check rather than
      // being assumed away here.
      if (activeOnPrimary.has(trip.service_id)) {
        candidateTrips.push({ trip, route, serviceDate: primaryServiceDate });
      }
      if (activeOnPrior.has(trip.service_id)) {
        candidateTrips.push({ trip, route, serviceDate: priorServiceDate });
      }
    }
  }

  if (candidateTrips.length === 0) {
    return unmatched([
      `No scheduled trips on ${identifierLabel} "${identifierValue}" are active for service date ${primaryServiceDate} (or the prior day, ${priorServiceDate}).`,
    ]);
  }

  const stopTimesByTrip = store.stopTimesForTrips(new Set(candidateTrips.map((c) => c.trip.trip_id)));

  const matches: CandidateTripMatch[] = [];
  for (const candidate of candidateTrips) {
    const stopTimes = stopTimesByTrip.get(candidate.trip.trip_id);
    if (!stopTimes || stopTimes.length < 2) continue;

    const origin = findClosestStopTime(stopTimes, segment.start, store);
    const destination = findClosestStopTime(stopTimes, segment.end, store);
    if (!origin || !destination) continue;

    // The origin stop must genuinely precede the destination stop on this
    // trip's own sequence — otherwise this is evidence of the wrong
    // direction/branch, not a real match.
    if (Number(origin.stopTime.stop_sequence) >= Number(destination.stopTime.stop_sequence)) continue;

    const departureSeconds = parseGtfsTimeToSeconds(origin.stopTime.departure_time || origin.stopTime.arrival_time);
    const arrivalSeconds = parseGtfsTimeToSeconds(destination.stopTime.arrival_time || destination.stopTime.departure_time);
    if (departureSeconds == null || arrivalSeconds == null) continue;

    const scheduledDeparture = gtfsServiceDateTimeToDate(candidate.serviceDate, departureSeconds);
    const scheduledArrival = gtfsServiceDateTimeToDate(candidate.serviceDate, arrivalSeconds);
    if (!scheduledDeparture || !scheduledArrival) continue;

    const timeDeltaMinutes = Math.abs(scheduledDeparture.getTime() - segment.startTime.getTime()) / 60_000;
    if (timeDeltaMinutes > DEPARTURE_TIME_MATCH_TOLERANCE_MINUTES) continue;

    matches.push({
      trip: candidate.trip,
      route: candidate.route,
      serviceDate: candidate.serviceDate,
      originStop: origin.stop,
      destinationStop: destination.stop,
      scheduledDeparture,
      scheduledArrival,
      timeDeltaMinutes,
    });
  }

  if (matches.length === 0) {
    return unmatched([
      `Found scheduled trips on ${identifierLabel} "${identifierValue}" for the active service date(s), but none had both a stop within ${STOP_MATCH_PROXIMITY_METERS}m of the segment's start/end and a scheduled departure within ${DEPARTURE_TIME_MATCH_TOLERANCE_MINUTES} minutes of Google's reported start time.`,
    ]);
  }

  matches.sort((a, b) => a.timeDeltaMinutes - b.timeDeltaMinutes);
  const [best, ...rest] = matches;
  const closeRivals = rest.filter((m) => m.timeDeltaMinutes - best.timeDeltaMinutes <= AMBIGUITY_MARGIN_MINUTES);

  if (closeRivals.length > 0) {
    return {
      routeMatch: {
        quality: "ambiguous",
        routeId: best.route.route_id,
        evidence: [
          `${1 + closeRivals.length} scheduled trips on ${identifierValue} are within ${AMBIGUITY_MARGIN_MINUTES} minutes of each other in schedule fit — cannot confidently pick one without guessing.`,
        ],
        ambiguousCandidateTripIds: [best.trip.trip_id, ...closeRivals.map((m) => m.trip.trip_id)],
      },
    };
  }

  const quality: TransitMatchQuality =
    best.timeDeltaMinutes <= EXACT_MATCH_TIME_TOLERANCE_MINUTES ? "exact" : "high-confidence";

  return {
    routeMatch: {
      quality,
      routeId: best.route.route_id,
      tripId: best.trip.trip_id,
      serviceId: best.trip.service_id,
      evidence: [
        `${identifierLabel} "${identifierValue}" matched GTFS route ${best.route.route_id} (${best.route.route_long_name}).`,
        `Origin stop "${best.originStop.stop_name}" is within ${STOP_MATCH_PROXIMITY_METERS}m of the segment's start location.`,
        `Destination stop "${best.destinationStop.stop_name}" is within ${STOP_MATCH_PROXIMITY_METERS}m of the segment's end location.`,
        `Scheduled departure (${best.scheduledDeparture.toISOString()}) is within ${best.timeDeltaMinutes.toFixed(1)} minutes of Google's reported segment start time.`,
      ],
    },
    resolved: {
      serviceDate: best.serviceDate,
      originStop: best.originStop,
      destinationStop: best.destinationStop,
      scheduledDeparture: best.scheduledDeparture,
      scheduledArrival: best.scheduledArrival,
    },
  };
}
