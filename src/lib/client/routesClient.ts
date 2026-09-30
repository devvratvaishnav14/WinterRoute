import type { Route, ResolvedLocation } from "@/lib/route/types";
import { reviveRoute, type SerializedRoute } from "@/lib/route/serialization";
import type { TimePreference, TransportMode } from "@/lib/trip/types";
import { throwApiError } from "./apiError";

export interface ComputeRouteRequest {
  origin: ResolvedLocation;
  destination: ResolvedLocation;
  mode: TransportMode;
  timePreference: TimePreference;
  dateTime: Date;
}

export interface ComputeRouteResponse {
  route: Route;
  providerWarnings: string[];
}

export async function computeRoute(
  request: ComputeRouteRequest,
  signal?: AbortSignal,
): Promise<ComputeRouteResponse> {
  const response = await fetch("/api/routes/compute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, dateTime: request.dateTime.toISOString() }),
    signal,
  });

  if (!response.ok) return throwApiError(response);

  const data = (await response.json()) as {
    route: SerializedRoute;
    providerWarnings: string[];
  };

  return { route: reviveRoute(data.route), providerWarnings: data.providerWarnings ?? [] };
}
