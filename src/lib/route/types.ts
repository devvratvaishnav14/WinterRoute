/**
 * A location that has been resolved to an actual geographic point — as
 * opposed to the plain, unverified text a user is currently typing into a
 * location field (component-local `string` state in
 * `components/trip/LocationAutocomplete.tsx`, not a formal domain type;
 * there's nothing structured to say about text that hasn't been verified
 * yet). Produced by resolving a selected Google Places suggestion via
 * `lib/google/places.ts` + `lib/google/transform.ts`. Keeping this
 * separate from raw input text means a route can never be built out of
 * text pretending to already be a verified point — see
 * docs/architecture.md.
 */
export interface ResolvedLocation {
  label: string;
  latitude: number;
  longitude: number;
  /** Which geocoding/places provider resolved this, once one exists. */
  provider?: string;
  /** That provider's own place identifier, if it has one. */
  providerPlaceId?: string;
}

/**
 * The mode of a single leg of an actual route — as opposed to
 * `TransportMode` (`lib/trip/types.ts`), which is the single mode the user
 * requested for the whole trip. A "transit" request, for example, may
 * resolve to a route with `walk`, `bus`, and `rail` segments. There is no
 * general mapping from a requested mode to a list of segment modes here on
 * purpose — computing that is a routing concern for whichever provider
 * eventually builds the route, not something this type should encode.
 */
export type SegmentTransportMode = "walk" | "cycle" | "drive" | "bus" | "rail";

/**
 * Identifying detail for a `bus`/`rail` segment, as reported by the
 * routing provider — a real line the segment travels on, not a raw
 * provider object. Exists specifically so a transit-data provider (e.g.
 * TransLink — see `lib/transit/matching.ts`) has real evidence (line
 * short name, stops, times) to match this segment against its own static
 * schedule data, without this domain type knowing anything about that
 * provider. `shortName` (e.g. "R5", "014") is the one that actually
 * matches a transit agency's own route numbering — confirmed live to be
 * zero-padded consistently with GTFS `route_short_name` — `longName` is
 * a human/corridor-style name ("Hastings St") not meant for matching.
 */
export interface RouteSegmentTransitLine {
  shortName: string;
  longName: string;
  headsign: string;
  agencyName: string;
}

/**
 * One leg of a route.
 *
 * Segment mode matters because weather/traffic/transit risk affects each
 * mode differently later: walking carries precipitation/ice/exposure risk,
 * driving and buses carry road-traffic and road-condition risk, rail
 * carries service-alert/disruption risk with little direct road-traffic
 * influence, cycling carries surface/wind/visibility risk. None of that
 * scoring exists yet — this type only needs to make the distinction
 * possible per segment. See docs/architecture.md.
 *
 * Deliberately excludes weather/traffic/transit condition fields — see the
 * "Route domain model" section of docs/architecture.md for why that's kept
 * separate from route structure.
 */
export interface RouteSegment {
  id: string;
  mode: SegmentTransportMode;
  start: ResolvedLocation;
  end: ResolvedLocation;
  /** Present once a route has been computed/scheduled. */
  startTime?: Date;
  endTime?: Date;
  durationMinutes?: number;
  distanceMeters?: number;
  /**
   * The segment's path as a sequence of coordinates along the actual
   * road/route (not just a straight line from `start` to `end`), when the
   * provider supplies one. Ordered start-to-end. Used for along-route
   * weather sampling (`lib/weather/sampling.ts`) so a sample point can be
   * placed on the real path rather than cutting across, e.g., a river or a
   * hillside a straight line would ignore.
   */
  geometry?: Array<{ latitude: number; longitude: number }>;
  /** Present only for `bus`/`rail` segments. */
  transitLine?: RouteSegmentTransitLine;
}

/**
 * A computed journey, made up of one or more segments.
 *
 * Every field except `segments` is optional because a route is built up
 * progressively (e.g. segments may exist before a baseline duration is
 * known, or before departure/arrival times are pinned down) — this type
 * should never be treated as "fully populated or don't use it."
 */
export interface Route {
  origin: ResolvedLocation;
  destination: ResolvedLocation;
  departureTime?: Date;
  arrivalTime?: Date;
  /**
   * The typical/normal duration for this route, once a routing provider
   * supplies it. Never user-entered (see `TripRequest`) and never
   * computed by WinterRoute itself — it comes from routing data.
   */
  baselineDurationMinutes?: number;
  totalDistanceMeters?: number;
  segments: RouteSegment[];
}
