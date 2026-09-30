import type { ResolvedLocation } from "@/lib/route/types";
import { throwApiError } from "./apiError";

export interface AutocompleteSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

export async function fetchAutocompleteSuggestions(
  input: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<AutocompleteSuggestion[]> {
  const response = await fetch("/api/places/autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, sessionToken }),
    signal,
  });

  if (!response.ok) return throwApiError(response);

  const data = (await response.json()) as { suggestions: AutocompleteSuggestion[] };
  return data.suggestions;
}

export interface ResolvedPlaceResult {
  location: ResolvedLocation;
  municipality: string | null;
  inServiceArea: boolean;
}

export async function resolvePlace(
  placeId: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<ResolvedPlaceResult> {
  const response = await fetch("/api/places/details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placeId, sessionToken }),
    signal,
  });

  if (!response.ok) return throwApiError(response);

  return (await response.json()) as ResolvedPlaceResult;
}
