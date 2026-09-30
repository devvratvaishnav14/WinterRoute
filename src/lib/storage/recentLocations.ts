import type { ResolvedLocation } from "@/lib/route/types";
import { readJSON, writeJSON } from "./safeStorage";

const STORAGE_KEY = "winterroute:recentLocations:v1";
const MAX_RECENT_LOCATIONS = 8;

export interface RecentLocation {
  location: ResolvedLocation;
  municipality: string | null;
  /** ISO timestamp. */
  lastUsedAt: string;
}

interface StoredShape {
  version: 1;
  items: RecentLocation[];
}

function isValidLocation(value: unknown): value is ResolvedLocation {
  if (!value || typeof value !== "object") return false;
  const location = value as Record<string, unknown>;
  return (
    typeof location.label === "string" &&
    typeof location.latitude === "number" &&
    typeof location.longitude === "number"
  );
}

function isValidRecentLocation(item: unknown): item is RecentLocation {
  if (!item || typeof item !== "object") return false;
  const entry = item as Record<string, unknown>;
  return isValidLocation(entry.location) && typeof entry.lastUsedAt === "string";
}

function isValidStoredShape(value: unknown): value is StoredShape {
  if (!value || typeof value !== "object") return false;
  const stored = value as Record<string, unknown>;
  return stored.version === 1 && Array.isArray(stored.items) && stored.items.every(isValidRecentLocation);
}

function locationKey(location: ResolvedLocation): string {
  return location.providerPlaceId ?? `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
}

/** Most recently used first. Returns [] for missing/corrupted storage — never throws. */
export function getRecentLocations(): RecentLocation[] {
  const stored = readJSON<unknown>(STORAGE_KEY, null);
  if (!isValidStoredShape(stored)) return [];
  // A proper 3-way comparator matters here: two entries added within the
  // same millisecond get identical `lastUsedAt` strings, and a comparator
  // that never returns 0 for ties doesn't reliably preserve the array's
  // already-correct (newest-first) order — see recentLocations.test.ts.
  return [...stored.items].sort((a, b) => {
    if (a.lastUsedAt === b.lastUsedAt) return 0;
    return a.lastUsedAt < b.lastUsedAt ? 1 : -1;
  });
}

/**
 * Records a real selected place. Deduplicates by place ID (falling back to
 * coordinates for a location without one) and moves an existing entry to
 * the top rather than creating a second one. Caller is responsible for
 * only calling this with an actually-resolved selection — never raw typed
 * text (see docs/architecture.md).
 */
export function addRecentLocation(
  location: ResolvedLocation,
  municipality: string | null,
): RecentLocation[] {
  const existing = getRecentLocations();
  const key = locationKey(location);
  const withoutDuplicate = existing.filter((item) => locationKey(item.location) !== key);

  const updated: RecentLocation[] = [
    { location, municipality, lastUsedAt: new Date().toISOString() },
    ...withoutDuplicate,
  ].slice(0, MAX_RECENT_LOCATIONS);

  writeJSON(STORAGE_KEY, { version: 1, items: updated } satisfies StoredShape);
  return updated;
}
