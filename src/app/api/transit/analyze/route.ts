import { analyzeRouteTransit } from "@/lib/transit/analyzeRouteTransit";
import { reviveRoute, type SerializedRoute } from "@/lib/route/serialization";
import type { TransportMode } from "@/lib/trip/types";
import { validateTripDateTime } from "@/lib/trip/validation";
import { apiError } from "@/lib/api/errors";

const TRANSPORT_MODES: TransportMode[] = ["walk", "car", "bus", "train", "cycle"];

function isSerializedRoute(value: unknown): value is SerializedRoute {
  if (!value || typeof value !== "object") return false;
  const route = value as Record<string, unknown>;
  return (
    typeof route.origin === "object" &&
    typeof route.destination === "object" &&
    Array.isArray(route.segments)
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_request", "Invalid request body.");
  }

  const { route, mode, dateTime } = (body ?? {}) as Record<string, unknown>;

  if (!isSerializedRoute(route)) {
    return apiError(400, "invalid_request", "A computed route is required.");
  }
  if (typeof mode !== "string" || !TRANSPORT_MODES.includes(mode as TransportMode)) {
    return apiError(400, "invalid_request", "Invalid transportation mode.");
  }

  const parsedDateTime = typeof dateTime === "string" ? new Date(dateTime) : null;
  if (!parsedDateTime || Number.isNaN(parsedDateTime.getTime())) {
    return apiError(400, "invalid_request", "Invalid trip date/time.");
  }

  const dateTimeCheck = validateTripDateTime(parsedDateTime);
  if (!dateTimeCheck.valid) {
    return apiError(
      400,
      "invalid_trip_time",
      dateTimeCheck.issue === "past"
        ? "That time has already passed."
        : "WinterRoute only predicts up to 72 hours ahead.",
    );
  }

  try {
    const result = await analyzeRouteTransit({
      route: reviveRoute(route),
      mode: mode as TransportMode,
      tripDateTime: parsedDateTime,
    });

    return Response.json({ result });
  } catch (error) {
    console.error("[transit/analyze] Unexpected error:", error);
    return apiError(500, "internal_error", "Something went wrong analyzing transit data. Please try again.");
  }
}
