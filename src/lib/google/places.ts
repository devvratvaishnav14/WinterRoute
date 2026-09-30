import { METRO_VANCOUVER_LOCATION_BIAS } from "@/lib/geo/serviceArea";
import { getGoogleMapsApiKey } from "./config";

const PLACES_API_BASE = "https://places.googleapis.com/v1";

export class GooglePlacesRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GooglePlacesRequestError";
  }
}

export interface GooglePlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

/** Only the fields WinterRoute actually consumes from a Place Details (New) response. */
export interface GooglePlaceDetails {
  id: string;
  displayNameText: string;
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  addressComponents: Array<{ longText: string; shortText: string; types: string[] }>;
}

interface FetchAutocompleteParams {
  input: string;
  sessionToken: string;
  signal?: AbortSignal;
}

/**
 * Calls Places Autocomplete (New). Biases toward Metro Vancouver and
 * restricts to Canada, but does not hard-restrict to the V1 service area —
 * municipality support is verified after a specific place is resolved (see
 * `lib/geo/serviceArea.ts`), not at the suggestion-list stage.
 */
export async function fetchPlaceAutocomplete({
  input,
  sessionToken,
  signal,
}: FetchAutocompleteParams): Promise<GooglePlaceSuggestion[]> {
  const response = await fetch(`${PLACES_API_BASE}/places:autocomplete`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleMapsApiKey(),
      // Only the fields the UI renders — no place types, no business metadata.
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify({
      input,
      sessionToken,
      includedRegionCodes: ["ca"],
      locationBias: {
        circle: {
          center: METRO_VANCOUVER_LOCATION_BIAS.center,
          radius: METRO_VANCOUVER_LOCATION_BIAS.radiusMeters,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new GooglePlacesRequestError(
      `Places Autocomplete request failed (${response.status})`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  };

  return (data.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId))
    .map((prediction) => ({
      placeId: prediction.placeId as string,
      mainText: prediction.structuredFormat?.mainText?.text ?? "",
      secondaryText: prediction.structuredFormat?.secondaryText?.text ?? "",
    }));
}

interface FetchPlaceDetailsParams {
  placeId: string;
  sessionToken: string;
  signal?: AbortSignal;
}

const PLACE_DETAILS_FIELD_MASK = "id,displayName,formattedAddress,location,addressComponents";

/**
 * Calls Place Details (New) for a place the user actually selected. Passing
 * the same `sessionToken` used for the preceding autocomplete calls closes
 * out that billing session, per Google's session-token model.
 */
export async function fetchPlaceDetails({
  placeId,
  sessionToken,
  signal,
}: FetchPlaceDetailsParams): Promise<GooglePlaceDetails> {
  const url = new URL(`${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set("sessionToken", sessionToken);

  const response = await fetch(url, {
    method: "GET",
    signal,
    headers: {
      "X-Goog-Api-Key": getGoogleMapsApiKey(),
      "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
    },
  });

  if (!response.ok) {
    throw new GooglePlacesRequestError(
      `Place Details request failed (${response.status})`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  };

  if (!data.id || data.location?.latitude === undefined || data.location?.longitude === undefined) {
    throw new GooglePlacesRequestError("Place Details response was missing required fields", 502);
  }

  return {
    id: data.id,
    displayNameText: data.displayName?.text ?? "",
    formattedAddress: data.formattedAddress ?? "",
    location: { latitude: data.location.latitude, longitude: data.location.longitude },
    addressComponents: (data.addressComponents ?? []).map((component) => ({
      longText: component.longText ?? "",
      shortText: component.shortText ?? "",
      types: component.types ?? [],
    })),
  };
}
