import type { ResolvedLocation } from "@/lib/route/types";
import type { TimePreference, TransportMode } from "@/lib/trip/types";
import { readJSON, writeJSON } from "./safeStorage";

const STORAGE_KEY = "winterroute:recentTrips:v1";
const MAX_RECENT_TRIPS = 8;
const CHANGE_EVENT = "winterroute:recent-trips-changed";

export interface RecentTrip {
  origin: ResolvedLocation;
  destination: ResolvedLocation;
  mode: TransportMode;
  timePreference: TimePreference;
  /** ISO timestamp. */
  lastUsedAt: string;
}

interface StoredShape {
  version: 1;
  items: RecentTrip[];
}

const VALID_MODES: TransportMode[] = ["walk", "car", "bus", "train", "cycle"];
const VALID_TIME_PREFERENCES: TimePreference[] = ["arriveBy", "leaveAt"];

function isValidLocation(value: unknown): value is ResolvedLocation {
  if (!value || typeof value !== "object") return false;
  const location = value as Record<string, unknown>;
  return (
    typeof location.label === "string" &&
    typeof location.latitude === "number" &&
    typeof location.longitude === "number"
  );
}

function isValidRecentTrip(item: unknown): item is RecentTrip {
  if (!item || typeof item !== "object") return false;
  const trip = item as Record<string, unknown>;
  return (
    isValidLocation(trip.origin) &&
    isValidLocation(trip.destination) &&
    typeof trip.mode === "string" &&
    VALID_MODES.includes(trip.mode as TransportMode) &&
    typeof trip.timePreference === "string" &&
    VALID_TIME_PREFERENCES.includes(trip.timePreference as TimePreference) &&
    typeof trip.lastUsedAt === "string"
  );
}

function isValidStoredShape(value: unknown): value is StoredShape {
  if (!value || typeof value !== "object") return false;
  const stored = value as Record<string, unknown>;
  return stored.version === 1 && Array.isArray(stored.items) && stored.items.every(isValidRecentTrip);
}

function locationKey(location: ResolvedLocation): string {
  return location.providerPlaceId ?? `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
}

/**
 * Two trips are the "same route" for dedup purposes if they share an
 * origin, destination, and transport mode — deliberately NOT time
 * preference, so reusing "SFU Burnaby -> Downtown Vancouver, Bus" with a
 * different arrive-by/leave-at choice updates the one existing entry
 * rather than creating a near-duplicate.
 */
function tripKey(trip: Pick<RecentTrip, "origin" | "destination" | "mode">): string {
  return `${locationKey(trip.origin)}|${locationKey(trip.destination)}|${trip.mode}`;
}

function computeRecentTrips(): RecentTrip[] {
  const stored = readJSON<unknown>(STORAGE_KEY, null);
  if (!isValidStoredShape(stored)) return [];
  // See the identical comment in recentLocations.ts: a comparator that
  // never returns 0 for tied timestamps doesn't reliably preserve the
  // array's already-correct order.
  return [...stored.items].sort((a, b) => {
    if (a.lastUsedAt === b.lastUsedAt) return 0;
    return a.lastUsedAt < b.lastUsedAt ? 1 : -1;
  });
}

/** Most recently used first. Returns [] for missing/corrupted storage — never throws. */
export function getRecentTrips(): RecentTrip[] {
  return computeRecentTrips();
}

// --- useSyncExternalStore support (see components/trip/TripForm.tsx) ---
//
// `getSnapshot` must return a referentially-stable value between calls
// when nothing has changed, or React can loop re-rendering forever. This
// caches the computed list and only recomputes when a change is actually
// signaled — either same-tab (the custom event, since same-tab writes
// don't fire the native `storage` event) or cross-tab (`storage`).

let cachedSnapshot: RecentTrip[] | null = null;

export function getRecentTripsSnapshot(): RecentTrip[] {
  if (cachedSnapshot === null) {
    cachedSnapshot = computeRecentTrips();
  }
  return cachedSnapshot;
}

// A fresh `[]` literal on every call would fail Object.is between renders,
// which React (correctly) warns about for useSyncExternalStore.
const EMPTY_SERVER_SNAPSHOT: RecentTrip[] = [];

export function getRecentTripsServerSnapshot(): RecentTrip[] {
  return EMPTY_SERVER_SNAPSHOT;
}

export function subscribeToRecentTrips(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  function handleChange() {
    cachedSnapshot = null;
    callback();
  }
  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener("storage", handleChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

/** Caller should only call this after a trip is actually submitted — never a failed/incomplete form. */
export function addRecentTrip(trip: Omit<RecentTrip, "lastUsedAt">): RecentTrip[] {
  const existing = getRecentTrips();
  const key = tripKey(trip);
  const withoutDuplicate = existing.filter((item) => tripKey(item) !== key);

  const updated: RecentTrip[] = [
    { ...trip, lastUsedAt: new Date().toISOString() },
    ...withoutDuplicate,
  ].slice(0, MAX_RECENT_TRIPS);

  writeJSON(STORAGE_KEY, { version: 1, items: updated } satisfies StoredShape);
  cachedSnapshot = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  return updated;
}
