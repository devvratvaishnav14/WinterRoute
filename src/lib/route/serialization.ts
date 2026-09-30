import type { Route, ResolvedLocation, RouteSegment } from "./types";

/** The shape a `Route` takes crossing a JSON boundary — `Date` fields become ISO strings. */
export interface SerializedRoute {
  origin: ResolvedLocation;
  destination: ResolvedLocation;
  departureTime?: string;
  arrivalTime?: string;
  baselineDurationMinutes?: number;
  totalDistanceMeters?: number;
  segments: Array<Omit<RouteSegment, "startTime" | "endTime"> & { startTime?: string; endTime?: string }>;
}

/**
 * JSON has no Date type — a `Route` crossing the wire (client → server or
 * server → client) has its `Date` fields as ISO strings, revived here.
 * Shared by the client's routes wrapper and the weather API route, which
 * both need to reconstruct a real `Route` from JSON.
 */
export function reviveRoute(raw: SerializedRoute): Route {
  return {
    origin: raw.origin,
    destination: raw.destination,
    departureTime: raw.departureTime ? new Date(raw.departureTime) : undefined,
    arrivalTime: raw.arrivalTime ? new Date(raw.arrivalTime) : undefined,
    baselineDurationMinutes: raw.baselineDurationMinutes,
    totalDistanceMeters: raw.totalDistanceMeters,
    segments: raw.segments.map((segment) => ({
      ...segment,
      startTime: segment.startTime ? new Date(segment.startTime) : undefined,
      endTime: segment.endTime ? new Date(segment.endTime) : undefined,
    })),
  };
}
