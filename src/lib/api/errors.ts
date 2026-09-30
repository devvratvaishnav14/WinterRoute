import { GoogleConfigurationError } from "@/lib/google/config";
import { GooglePlacesRequestError } from "@/lib/google/places";
import { GoogleRouteNotFoundError, GoogleRoutesRequestError } from "@/lib/google/routes";

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } } satisfies ApiErrorBody, { status });
}

/**
 * Maps a caught error from a Route Handler into a safe, user-facing JSON
 * error response. Never forwards the raw error object, a Google response
 * body, or anything that could contain the API key — only a fixed,
 * pre-written message per error category. Logs the real error server-side
 * (never sent to the client) so it's still diagnosable.
 */
export function mapProviderError(error: unknown, context: string): Response {
  if (error instanceof GoogleConfigurationError) {
    console.error(`[${context}] Google Maps API key is not configured.`);
    return apiError(
      503,
      "configuration_error",
      "This feature isn't available right now. Please try again later.",
    );
  }

  if (error instanceof GoogleRouteNotFoundError) {
    return apiError(404, "route_not_found", "We couldn't find a route for this trip.");
  }

  if (error instanceof GooglePlacesRequestError || error instanceof GoogleRoutesRequestError) {
    console.error(`[${context}] Google API request failed with status ${error.status}`);
    if (error.status === 429) {
      return apiError(429, "rate_limited", "Too many requests right now. Please wait a moment and try again.");
    }
    if (error.status === 403 || error.status === 401) {
      return apiError(503, "provider_unavailable", "This feature isn't available right now. Please try again later.");
    }
    return apiError(502, "provider_error", "We couldn't reach the routing service. Please try again.");
  }

  if (error instanceof Error && error.name === "AbortError") {
    return apiError(499, "aborted", "Request was cancelled.");
  }

  console.error(`[${context}] Unexpected error:`, error);
  return apiError(500, "internal_error", "Something went wrong. Please try again.");
}
