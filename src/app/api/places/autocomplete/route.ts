import { fetchPlaceAutocomplete } from "@/lib/google/places";
import { mapProviderError, apiError } from "@/lib/api/errors";
import {
  AUTOCOMPLETE_MAX_INPUT_LENGTH,
  AUTOCOMPLETE_MIN_INPUT_LENGTH,
} from "@/lib/places/constants";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_request", "Invalid request body.");
  }

  const { input, sessionToken } = (body ?? {}) as { input?: unknown; sessionToken?: unknown };

  if (typeof sessionToken !== "string" || sessionToken.length === 0) {
    return apiError(400, "invalid_request", "Missing session token.");
  }

  if (typeof input !== "string") {
    return apiError(400, "invalid_request", "Missing search text.");
  }

  if (input.length > AUTOCOMPLETE_MAX_INPUT_LENGTH) {
    return apiError(400, "invalid_request", "Search text is too long.");
  }

  const trimmed = input.trim();
  if (trimmed.length < AUTOCOMPLETE_MIN_INPUT_LENGTH) {
    // Not an error — just nothing to suggest yet. Also guards Google
    // request volume if this endpoint is hit directly, bypassing the
    // client's own min-length gate.
    return Response.json({ suggestions: [] });
  }

  try {
    const suggestions = await fetchPlaceAutocomplete({ input: trimmed, sessionToken });
    return Response.json({ suggestions });
  } catch (error) {
    return mapProviderError(error, "places/autocomplete");
  }
}
