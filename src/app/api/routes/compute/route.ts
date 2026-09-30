import { computeBaselineRoute } from "@/lib/route/computeRoute";
import type { ResolvedLocation } from "@/lib/route/types";
import type { TimePreference, TransportMode } from "@/lib/trip/types";
import { validateTripDateTime } from "@/lib/trip/validation";
import { mapProviderError, apiError } from "@/lib/api/errors";

const TRANSPORT_MODES: TransportMode[] = ["walk", "car", "bus", "train", "cycle"];
const TIME_PREFERENCES: TimePreference[] = ["arriveBy", "leaveAt"];

function isResolvedLocation(value: unknown): value is ResolvedLocation {
  if (!value || typeof value !== "object") return false;
  const location = value as Record<string, unknown>;
  return (
    typeof location.label === "string" &&
    typeof location.latitude === "number" &&
    typeof location.longitude === "number"
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_request", "Invalid request body.");
  }

  const { origin, destination, mode, timePreference, dateTime } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!isResolvedLocation(origin) || !isResolvedLocation(destination)) {
    return apiError(
      400,
      "unresolved_location",
      "Both locations must be selected from suggestions before a route can be calculated.",
    );
  }

  if (typeof mode !== "string" || !TRANSPORT_MODES.includes(mode as TransportMode)) {
    return apiError(400, "invalid_request", "Invalid transportation mode.");
  }

  if (typeof timePreference !== "string" || !TIME_PREFERENCES.includes(timePreference as TimePreference)) {
    return apiError(400, "invalid_request", "Invalid time preference.");
  }

  const parsedDateTime = typeof dateTime === "string" ? new Date(dateTime) : null;
  if (!parsedDateTime || Number.isNaN(parsedDateTime.getTime())) {
    return apiError(400, "invalid_request", "Invalid trip date/time.");
  }

  // Re-validated server-side (defense in depth) — the client already
  // enforces the 72-hour window, but this endpoint shouldn't trust that.
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
    const { route, providerWarnings } = await computeBaselineRoute({
      origin,
      destination,
      mode: mode as TransportMode,
      timePreference: timePreference as TimePreference,
      dateTime: parsedDateTime,
    });

    return Response.json({ route, providerWarnings });
  } catch (error) {
    return mapProviderError(error, "routes/compute");
  }
}
