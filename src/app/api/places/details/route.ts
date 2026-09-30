import { fetchPlaceDetails } from "@/lib/google/places";
import { googlePlaceDetailsToResolvedLocation } from "@/lib/google/transform";
import { detectMunicipality, isSupportedMunicipality } from "@/lib/geo/serviceArea";
import { mapProviderError, apiError } from "@/lib/api/errors";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_request", "Invalid request body.");
  }

  const { placeId, sessionToken } = (body ?? {}) as { placeId?: unknown; sessionToken?: unknown };

  if (typeof placeId !== "string" || placeId.length === 0) {
    return apiError(400, "invalid_request", "Missing place ID.");
  }
  if (typeof sessionToken !== "string" || sessionToken.length === 0) {
    return apiError(400, "invalid_request", "Missing session token.");
  }

  try {
    const details = await fetchPlaceDetails({ placeId, sessionToken });
    const location = googlePlaceDetailsToResolvedLocation(details);
    const municipality = detectMunicipality(details.addressComponents);
    const inServiceArea = isSupportedMunicipality(municipality);

    return Response.json({ location, municipality, inServiceArea });
  } catch (error) {
    return mapProviderError(error, "places/details");
  }
}
