import { getGoogleMapsApiKey } from "./config";
import { decodePolyline } from "./polyline";

const COMPUTE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export class GoogleRoutesRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GoogleRoutesRequestError";
  }
}

export class GoogleRouteNotFoundError extends Error {
  constructor() {
    super("Google Routes returned no route for this trip.");
    this.name = "GoogleRouteNotFoundError";
  }
}

export type GoogleTravelMode = "WALK" | "DRIVE" | "BICYCLE" | "TRANSIT";

export interface GoogleLatLng {
  latitude: number;
  longitude: number;
}

export interface GoogleComputeRoutesParams {
  originLatLng: GoogleLatLng;
  destinationLatLng: GoogleLatLng;
  travelMode: GoogleTravelMode;
  /** Only valid (and only ever set here) for DRIVE — Google rejects it for other modes. */
  routingPreference?: "TRAFFIC_UNAWARE";
  /** RFC 3339. Mutually exclusive with arrivalTime; arrivalTime is TRANSIT-only. */
  departureTime?: string;
  arrivalTime?: string;
  transitAllowedTravelModes?: Array<"BUS" | "RAIL">;
  signal?: AbortSignal;
}

export interface GoogleRouteStep {
  travelMode: string;
  distanceMeters: number;
  staticDurationSeconds: number;
  startLocation: GoogleLatLng;
  endLocation: GoogleLatLng;
  /** Decoded path along this step, when Google provides one. Ordered start-to-end. */
  polyline: GoogleLatLng[];
  transitDetails?: {
    vehicleType: string;
    lineName: string;
    /**
     * e.g. "R5", "014" — confirmed live to be zero-padded to match GTFS
     * `route_short_name` exactly for regular routes. This, not `lineName`
     * (a descriptive corridor name like "Hastings St"), is what
     * `lib/transit/matching.ts` matches against TransLink's static GTFS —
     * added specifically for that purpose (not captured by the original
     * routing-stage transform, which didn't yet need it).
     */
    lineNameShort: string;
    headsign: string;
    agencyName: string;
    departureStopName: string;
    departureStopLocation: GoogleLatLng;
    departureTime: string;
    arrivalStopName: string;
    arrivalStopLocation: GoogleLatLng;
    arrivalTime: string;
  };
}

export interface GoogleComputeRoutesResult {
  distanceMeters: number;
  staticDurationSeconds: number;
  steps: GoogleRouteStep[];
  warnings: string[];
}

/**
 * Request only the fields the Route/RouteSegment domain model needs — no
 * `routes.*` wildcard. `routes.staticDuration` (not `routes.duration`) is
 * requested deliberately: `staticDuration` is the typical duration without
 * live traffic, which is what WinterRoute's *baseline* needs (see
 * docs/architecture.md — live traffic is a later, separate concern).
 */
const FIELD_MASK = [
  "routes.distanceMeters",
  "routes.staticDuration",
  "routes.warnings",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.startLocation",
  "routes.legs.steps.endLocation",
  "routes.legs.steps.polyline.encodedPolyline",
  "routes.legs.steps.transitDetails",
].join(",");

function parseGoogleDurationSeconds(value: string | undefined): number {
  if (!value) return 0;
  const match = /^(\d+)s$/.exec(value);
  return match ? Number(match[1]) : 0;
}

export async function fetchComputeRoutes(
  params: GoogleComputeRoutesParams,
): Promise<GoogleComputeRoutesResult> {
  const body: Record<string, unknown> = {
    origin: { location: { latLng: params.originLatLng } },
    destination: { location: { latLng: params.destinationLatLng } },
    travelMode: params.travelMode,
    units: "METRIC",
  };

  if (params.routingPreference) body.routingPreference = params.routingPreference;
  if (params.departureTime) body.departureTime = params.departureTime;
  if (params.arrivalTime) body.arrivalTime = params.arrivalTime;
  if (params.transitAllowedTravelModes) {
    body.transitPreferences = { allowedTravelModes: params.transitAllowedTravelModes };
  }

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
    console.error(`[google/routes] computeRoutes ${response.status}:`, errorBody);
    throw new GoogleRoutesRequestError(
      `Routes computeRoutes request failed (${response.status})`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    routes?: Array<{
      distanceMeters?: number;
      staticDuration?: string;
      warnings?: string[];
      legs?: Array<{
        steps?: Array<{
          travelMode?: string;
          distanceMeters?: number;
          staticDuration?: string;
          startLocation?: { latLng?: GoogleLatLng };
          endLocation?: { latLng?: GoogleLatLng };
          polyline?: { encodedPolyline?: string };
          transitDetails?: {
            stopDetails?: {
              departureStop?: { name?: string; location?: { latLng?: GoogleLatLng } };
              departureTime?: string;
              arrivalStop?: { name?: string; location?: { latLng?: GoogleLatLng } };
              arrivalTime?: string;
            };
            headsign?: string;
            transitLine?: {
              name?: string;
              nameShort?: string;
              vehicle?: { type?: string };
              agencies?: Array<{ name?: string }>;
            };
          };
        }>;
      }>;
    }>;
  };

  const route = data.routes?.[0];
  if (!route) {
    throw new GoogleRouteNotFoundError();
  }

  const steps: GoogleRouteStep[] = (route.legs ?? []).flatMap((leg) =>
    (leg.steps ?? []).map((step) => {
      const transit = step.transitDetails;
      return {
        travelMode: step.travelMode ?? "",
        distanceMeters: step.distanceMeters ?? 0,
        staticDurationSeconds: parseGoogleDurationSeconds(step.staticDuration),
        startLocation: step.startLocation?.latLng ?? { latitude: 0, longitude: 0 },
        endLocation: step.endLocation?.latLng ?? { latitude: 0, longitude: 0 },
        polyline: step.polyline?.encodedPolyline ? decodePolyline(step.polyline.encodedPolyline) : [],
        transitDetails: transit
          ? {
              vehicleType: transit.transitLine?.vehicle?.type ?? "OTHER",
              lineName: transit.transitLine?.name ?? "",
              lineNameShort: transit.transitLine?.nameShort ?? "",
              headsign: transit.headsign ?? "",
              agencyName: transit.transitLine?.agencies?.[0]?.name ?? "",
              departureStopName: transit.stopDetails?.departureStop?.name ?? "",
              departureStopLocation: transit.stopDetails?.departureStop?.location?.latLng ?? {
                latitude: step.startLocation?.latLng?.latitude ?? 0,
                longitude: step.startLocation?.latLng?.longitude ?? 0,
              },
              departureTime: transit.stopDetails?.departureTime ?? "",
              arrivalStopName: transit.stopDetails?.arrivalStop?.name ?? "",
              arrivalStopLocation: transit.stopDetails?.arrivalStop?.location?.latLng ?? {
                latitude: step.endLocation?.latLng?.latitude ?? 0,
                longitude: step.endLocation?.latLng?.longitude ?? 0,
              },
              arrivalTime: transit.stopDetails?.arrivalTime ?? "",
            }
          : undefined,
      };
    }),
  );

  return {
    distanceMeters: route.distanceMeters ?? 0,
    staticDurationSeconds: parseGoogleDurationSeconds(route.staticDuration),
    steps,
    warnings: route.warnings ?? [],
  };
}
