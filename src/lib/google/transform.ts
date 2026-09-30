import type { TransportMode } from "@/lib/trip/types";
import type { Route, ResolvedLocation, RouteSegment, SegmentTransportMode } from "@/lib/route/types";
import { deriveSegmentTimes } from "@/lib/route/timeline";
import type { GoogleComputeRoutesResult, GoogleRouteStep, GoogleTravelMode } from "./routes";
import type { GooglePlaceDetails } from "./places";

// ---------------------------------------------------------------------------
// WinterRoute request -> Google request
// ---------------------------------------------------------------------------

/**
 * Maps a requested `TransportMode` to Google's travel mode (+ a transit
 * vehicle preference where relevant). This is a *preference* passed to
 * Google's `transitPreferences.allowedTravelModes`, not a guarantee — a
 * "Bus" request can still return a route that needs a short walk, and
 * Google may still substitute vehicle types where a matching route can't
 * be found with the strict preference.
 */
export function transportModeToGoogleRequest(mode: TransportMode): {
  travelMode: GoogleTravelMode;
  transitAllowedTravelModes?: Array<"BUS" | "RAIL">;
} {
  switch (mode) {
    case "walk":
      return { travelMode: "WALK" };
    case "car":
      return { travelMode: "DRIVE" };
    case "cycle":
      return { travelMode: "BICYCLE" };
    case "bus":
      return { travelMode: "TRANSIT", transitAllowedTravelModes: ["BUS"] };
    case "train":
      return { travelMode: "TRANSIT", transitAllowedTravelModes: ["RAIL"] };
  }
}

// ---------------------------------------------------------------------------
// Google Place -> ResolvedLocation
// ---------------------------------------------------------------------------

export function googlePlaceDetailsToResolvedLocation(details: GooglePlaceDetails): ResolvedLocation {
  return {
    label: details.displayNameText || details.formattedAddress || "Selected location",
    latitude: details.location.latitude,
    longitude: details.location.longitude,
    provider: "google-places",
    providerPlaceId: details.id,
  };
}

// ---------------------------------------------------------------------------
// Google route step -> RouteSegment
// ---------------------------------------------------------------------------

function mapGoogleTravelModeToSegmentMode(travelMode: string): SegmentTransportMode {
  switch (travelMode) {
    case "WALK":
      return "walk";
    case "BICYCLE":
      return "cycle";
    case "DRIVE":
      return "drive";
    default:
      // Shouldn't happen for a non-TRANSIT step; fall back rather than throw.
      return "walk";
  }
}

const BUS_LIKE_VEHICLE_TYPES = new Set(["BUS", "INTERCITY_BUS", "TROLLEYBUS"]);
const RAIL_LIKE_VEHICLE_TYPES = new Set([
  "SUBWAY",
  "TRAIN",
  "LIGHT_RAIL",
  "RAIL",
  "HEAVY_RAIL",
  "COMMUTER_TRAIN",
  "HIGH_SPEED_TRAIN",
  "LONG_DISTANCE_TRAIN",
  "METRO_RAIL",
  "MONORAIL",
  "TRAM",
  "CABLE_CAR",
  "FUNICULAR",
  "GONDOLA_LIFT",
]);

/**
 * Maps Google's `TransitVehicleType` to our lean `SegmentTransportMode`
 * (`walk | cycle | drive | bus | rail` — no dedicated ferry/taxi/etc. type,
 * by design; see docs/architecture.md).
 *
 * Known limitation: `FERRY`, `SHARE_TAXI`, and `OTHER` don't have a close
 * match and default to `rail` here — chosen because, like rail, they're not
 * road-traffic-affected the way `bus` is, which is the risk-relevant
 * distinction this type exists to make. This is a deliberate simplification,
 * not an oversight: none of these are expected to occur for trips confined
 * to WinterRoute's V1 service area (Vancouver/Burnaby/Surrey — no ferry
 * crossings in scope). Revisit if the service area expands to include one.
 */
export function mapTransitVehicleTypeToSegmentMode(vehicleType: string): SegmentTransportMode {
  if (BUS_LIKE_VEHICLE_TYPES.has(vehicleType)) return "bus";
  if (RAIL_LIKE_VEHICLE_TYPES.has(vehicleType)) return "rail";
  return "rail";
}

interface StepGroup {
  travelMode: string;
  steps: GoogleRouteStep[];
}

/**
 * Groups consecutive raw Google steps into WinterRoute segments.
 *
 * Merge rule: adjacent steps with the same `travelMode` are merged into one
 * group, **except** `TRANSIT` steps are never merged with each other — each
 * `TRANSIT` step is one physical ride (its own line, stops, and schedule),
 * so merging two of them would silently erase a transfer. Non-transit steps
 * (`WALK`/`DRIVE`/`BICYCLE`) are turn-by-turn maneuvers with no meaning at
 * WinterRoute's level, so collapsing consecutive ones is safe.
 *
 * This is why `WALK`/`DRIVE`/`BICYCLE` steps never need to merge across a
 * `TRANSIT` step in practice: Google only mixes travel modes within a
 * `TRANSIT`-mode response (walking connectors around transit legs), so
 * every group boundary in a real response has a `TRANSIT` group on one
 * side, whose stop name/location is used as the shared boundary point (see
 * `boundaryLocation` below) — confirmed against real API responses, not
 * assumed.
 */
function groupGoogleSteps(steps: GoogleRouteStep[]): StepGroup[] {
  const groups: StepGroup[] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    const canExtend = last && last.travelMode === step.travelMode && step.travelMode !== "TRANSIT";
    if (canExtend) {
      last.steps.push(step);
    } else {
      groups.push({ travelMode: step.travelMode, steps: [step] });
    }
  }
  return groups;
}

/** A transit step's own departure or arrival stop, as a ResolvedLocation. */
function transitStopLocation(step: GoogleRouteStep, side: "departure" | "arrival"): ResolvedLocation {
  const details = step.transitDetails!;
  const name = side === "departure" ? details.departureStopName : details.arrivalStopName;
  const location = side === "departure" ? details.departureStopLocation : details.arrivalStopLocation;
  return { label: name || "Transit stop", latitude: location.latitude, longitude: location.longitude };
}

/**
 * The boundary point between two adjacent groups, when neither is the
 * route's overall origin/destination. Whichever of the two groups is
 * TRANSIT supplies the real stop name/location for that shared point — a
 * WALK step's own raw coordinates are only used as a last-resort fallback
 * (see the doc comment on groupGoogleSteps for why a real response should
 * always have a TRANSIT group on one side of every internal boundary).
 */
function boundaryBetween(before: StepGroup, after: StepGroup): ResolvedLocation {
  const beforeLastStep = before.steps[before.steps.length - 1];
  if (beforeLastStep.travelMode === "TRANSIT" && beforeLastStep.transitDetails) {
    return transitStopLocation(beforeLastStep, "arrival");
  }

  const afterFirstStep = after.steps[0];
  if (afterFirstStep.travelMode === "TRANSIT" && afterFirstStep.transitDetails) {
    return transitStopLocation(afterFirstStep, "departure");
  }

  const location = beforeLastStep.endLocation;
  return { label: "Route point", latitude: location.latitude, longitude: location.longitude };
}

function groupToSegment(
  group: StepGroup,
  index: number,
  groups: StepGroup[],
  origin: ResolvedLocation,
  destination: ResolvedLocation,
): RouteSegment {
  const isFirst = index === 0;
  const isLast = index === groups.length - 1;
  const firstStep = group.steps[0];
  const isTransit = firstStep.travelMode === "TRANSIT";

  const mode = isTransit
    ? mapTransitVehicleTypeToSegmentMode(firstStep.transitDetails?.vehicleType ?? "OTHER")
    : mapGoogleTravelModeToSegmentMode(firstStep.travelMode);

  const start = isFirst
    ? origin
    : isTransit
      ? transitStopLocation(firstStep, "departure")
      : boundaryBetween(groups[index - 1], group);

  const end = isLast
    ? destination
    : isTransit
      ? transitStopLocation(firstStep, "arrival")
      : boundaryBetween(group, groups[index + 1]);

  const distanceMeters = group.steps.reduce((sum, step) => sum + step.distanceMeters, 0);
  const durationMinutes = Math.round(
    group.steps.reduce((sum, step) => sum + step.staticDurationSeconds, 0) / 60,
  );
  const geometry = group.steps.flatMap((step) => step.polyline);

  const segment: RouteSegment = {
    id: `segment-${index}`,
    mode,
    start,
    end,
    durationMinutes,
    distanceMeters,
    ...(geometry.length > 0 ? { geometry } : {}),
  };

  // TRANSIT steps carry Google's own real schedule times — use them
  // directly rather than deriving them (see deriveSegmentTimes below).
  if (firstStep.travelMode === "TRANSIT" && firstStep.transitDetails) {
    segment.startTime = new Date(firstStep.transitDetails.departureTime);
    segment.endTime = new Date(firstStep.transitDetails.arrivalTime);
    segment.transitLine = {
      shortName: firstStep.transitDetails.lineNameShort,
      longName: firstStep.transitDetails.lineName,
      headsign: firstStep.transitDetails.headsign,
      agencyName: firstStep.transitDetails.agencyName,
    };
  }

  return segment;
}

export function buildSegmentsFromGoogleSteps(
  steps: GoogleRouteStep[],
  origin: ResolvedLocation,
  destination: ResolvedLocation,
): RouteSegment[] {
  const groups = groupGoogleSteps(steps);
  return groups.map((group, index) => groupToSegment(group, index, groups, origin, destination));
}

// ---------------------------------------------------------------------------
// Google computeRoutes response -> Route
// ---------------------------------------------------------------------------

export interface BuildRouteParams {
  googleResult: GoogleComputeRoutesResult;
  origin: ResolvedLocation;
  destination: ResolvedLocation;
  /** Only pass this for "Leave at" trips — see deriveSegmentTimes above. */
  knownDepartureTime?: Date;
}

export function buildRouteFromGoogleResult({
  googleResult,
  origin,
  destination,
  knownDepartureTime,
}: BuildRouteParams): Route {
  const segments = buildSegmentsFromGoogleSteps(googleResult.steps, origin, destination);
  deriveSegmentTimes(segments, knownDepartureTime);

  return {
    origin,
    destination,
    departureTime: segments[0]?.startTime,
    arrivalTime: segments[segments.length - 1]?.endTime,
    baselineDurationMinutes: Math.round(googleResult.staticDurationSeconds / 60),
    totalDistanceMeters: googleResult.distanceMeters,
    segments,
  };
}
