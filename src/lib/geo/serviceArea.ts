/**
 * WinterRoute V1 service area — see docs/overview.md. Only the *selected*
 * start/end locations are restricted to these municipalities; a trip may
 * still legitimately pass through an unsupported municipality (e.g. New
 * Westminster) along the way. That's a routing/analysis concern for later,
 * not something this check enforces.
 */
export const SUPPORTED_MUNICIPALITIES = ["Vancouver", "Burnaby", "Surrey"] as const;

export type SupportedMunicipality = (typeof SUPPORTED_MUNICIPALITIES)[number];

export const UNSUPPORTED_SERVICE_AREA_MESSAGE =
  "WinterRoute currently supports trips starting and ending in Vancouver, Burnaby, and Surrey.";

/** A location bias circle roughly covering Vancouver, Burnaby, and Surrey. */
export const METRO_VANCOUVER_LOCATION_BIAS = {
  center: { latitude: 49.2276, longitude: -123.0075 },
  radiusMeters: 35000,
};

export interface AddressComponent {
  longText: string;
  types: string[];
}

/**
 * Best-effort extraction of the municipality (locality) name from a
 * resolved place's address components.
 *
 * Limitation: Google's `locality` component doesn't perfectly correspond
 * to "which of Vancouver/Burnaby/Surrey is this in" for every address.
 * Known gaps:
 * - Some points of interest (large parks, university campuses that span a
 *   boundary, etc.) may report a `locality` that differs from the
 *   colloquial neighborhood name.
 * - Unincorporated areas or some address types may omit `locality`
 *   entirely, in which case this returns null and the caller treats it as
 *   unsupported rather than guessing.
 * - This is a pragmatic V1 check against Google's own geocoded component,
 *   not an authoritative municipal boundary/geofence lookup.
 */
export function detectMunicipality(addressComponents: AddressComponent[]): string | null {
  const locality = addressComponents.find((component) => component.types.includes("locality"));
  return locality?.longText ?? null;
}

export function isSupportedMunicipality(
  municipality: string | null,
): municipality is SupportedMunicipality {
  if (!municipality) return false;
  const normalized = municipality.trim().toLowerCase();
  return SUPPORTED_MUNICIPALITIES.some((supported) => supported.toLowerCase() === normalized);
}
