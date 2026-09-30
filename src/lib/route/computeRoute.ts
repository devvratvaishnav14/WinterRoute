import type { TimePreference, TransportMode } from "@/lib/trip/types";
import { fetchComputeRoutes } from "@/lib/google/routes";
import { buildRouteFromGoogleResult, transportModeToGoogleRequest } from "@/lib/google/transform";
import type { ResolvedLocation, Route } from "./types";

export interface ComputeBaselineRouteParams {
  origin: ResolvedLocation;
  destination: ResolvedLocation;
  mode: TransportMode;
  timePreference: TimePreference;
  dateTime: Date;
  signal?: AbortSignal;
}

export interface ComputeBaselineRouteResult {
  route: Route;
  /** Provider disclaimers to surface as-is — never silently dropped. */
  providerWarnings: string[];
}

/**
 * Google requires this exact disclaimer to be shown to users for any
 * walking/bicycling route it returns — see docs/architecture.md "Google
 * Routes API" section for the source. Not something WinterRoute chose to
 * add; it's a usage requirement.
 */
/** Exported so `lib/route/routeNotePresentation.ts` can recognize this EXACT known warning and present it with simplified wording, rather than every provider warning needing its own hardcoded simplification. */
export const WALK_CYCLE_PROVIDER_WARNING =
  "Walking, bicycling, and two-wheel routes are in beta and might sometimes be missing clear sidewalks, pedestrian paths, or bicycling paths.";

/**
 * Computes WinterRoute's baseline (typical, non-live-traffic) route for a
 * trip and converts it into our `Route`/`RouteSegment` domain model. This
 * is the only place that decides how a `TripRequest` becomes a Google
 * Routes request — callers (Route Handlers) shouldn't build that request
 * shape themselves.
 */
export async function computeBaselineRoute(
  params: ComputeBaselineRouteParams,
): Promise<ComputeBaselineRouteResult> {
  const { travelMode, transitAllowedTravelModes } = transportModeToGoogleRequest(params.mode);
  const isDrive = travelMode === "DRIVE";
  const isTransit = travelMode === "TRANSIT";

  // Only ever sent to Google for TRANSIT, which can resolve a real
  // schedule for a specific departure/arrival instant. For DRIVE, Google
  // rejects *any* timestamp when routingPreference is TRAFFIC_UNAWARE
  // ("Timestamp cannot be set for TRAFFIC_UNAWARE routing mode" — a real
  // 400 from computeRoutes, discovered while building this, not assumed
  // from docs; see docs/architecture.md). That's a fitting constraint
  // anyway: a live-traffic-free *static* baseline is inherently
  // time-independent. WALK/BICYCLE have no schedule concept either, so
  // there's nothing meaningful to send. WinterRoute's own knowledge of the
  // user's chosen "leave at" time (used for segment timing below) is
  // independent of what we tell Google.
  const departureTime = isTransit && params.timePreference === "leaveAt" ? params.dateTime.toISOString() : undefined;
  const arrivalTime = isTransit && params.timePreference === "arriveBy" ? params.dateTime.toISOString() : undefined;

  const googleResult = await fetchComputeRoutes({
    originLatLng: { latitude: params.origin.latitude, longitude: params.origin.longitude },
    destinationLatLng: { latitude: params.destination.latitude, longitude: params.destination.longitude },
    travelMode,
    // Only valid for DRIVE. TRAFFIC_UNAWARE keeps this a live-traffic-free
    // baseline request — we also always read staticDuration regardless.
    routingPreference: isDrive ? "TRAFFIC_UNAWARE" : undefined,
    departureTime,
    arrivalTime,
    transitAllowedTravelModes,
    signal: params.signal,
  });

  const knownDepartureTime = params.timePreference === "leaveAt" ? params.dateTime : undefined;

  const route = buildRouteFromGoogleResult({
    googleResult,
    origin: params.origin,
    destination: params.destination,
    knownDepartureTime,
  });

  const providerWarnings = [...googleResult.warnings];
  if (travelMode === "WALK" || travelMode === "BICYCLE") {
    providerWarnings.push(WALK_CYCLE_PROVIDER_WARNING);
  }

  return { route, providerWarnings };
}
