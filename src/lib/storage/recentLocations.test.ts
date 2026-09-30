// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { ResolvedLocation } from "@/lib/route/types";
import { addRecentLocation, getRecentLocations } from "./recentLocations";

const STORAGE_KEY = "winterroute:recentLocations:v1";

function location(overrides: Partial<ResolvedLocation> = {}): ResolvedLocation {
  return { label: "SFU Burnaby", latitude: 49.2781, longitude: -122.9199, providerPlaceId: "place-sfu", ...overrides };
}

beforeEach(() => {
  localStorage.clear();
});

describe("getRecentLocations", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(getRecentLocations()).toEqual([]);
  });

  it("returns [] rather than throwing for corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(getRecentLocations()).toEqual([]);
  });

  it("returns [] rather than throwing for a validly-parsed but wrong shape", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ oops: "wrong shape entirely" }));
    expect(getRecentLocations()).toEqual([]);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, items: [{ notALocation: true }] }));
    expect(getRecentLocations()).toEqual([]);
  });

  it("returns [] for a future/unknown storage version rather than misreading it", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, items: [{ location: location(), municipality: "Burnaby", lastUsedAt: "x" }] }),
    );
    expect(getRecentLocations()).toEqual([]);
  });
});

describe("addRecentLocation", () => {
  it("adds a location and persists it", () => {
    addRecentLocation(location(), "Burnaby");
    const stored = getRecentLocations();
    expect(stored).toHaveLength(1);
    expect(stored[0].location.label).toBe("SFU Burnaby");
    expect(stored[0].municipality).toBe("Burnaby");
  });

  it("moves a re-selected location to the top instead of duplicating it", () => {
    addRecentLocation(location({ providerPlaceId: "place-a", label: "A" }), "Burnaby");
    addRecentLocation(location({ providerPlaceId: "place-b", label: "B" }), "Vancouver");
    addRecentLocation(location({ providerPlaceId: "place-a", label: "A" }), "Burnaby");

    const stored = getRecentLocations();
    expect(stored).toHaveLength(2);
    expect(stored[0].location.providerPlaceId).toBe("place-a");
    expect(stored[1].location.providerPlaceId).toBe("place-b");
  });

  it("deduplicates by coordinates when a location has no provider place ID", () => {
    addRecentLocation(location({ providerPlaceId: undefined, latitude: 1, longitude: 2 }), null);
    addRecentLocation(location({ providerPlaceId: undefined, latitude: 1, longitude: 2 }), null);
    expect(getRecentLocations()).toHaveLength(1);
  });

  it("caps the list at 8 entries, dropping the oldest", () => {
    for (let i = 0; i < 10; i++) {
      addRecentLocation(location({ providerPlaceId: `place-${i}`, label: `Place ${i}` }), null);
    }
    const stored = getRecentLocations();
    expect(stored).toHaveLength(8);
    // Most recent (place-9) first; oldest two (place-0, place-1) dropped.
    expect(stored[0].location.providerPlaceId).toBe("place-9");
    expect(stored.some((entry) => entry.location.providerPlaceId === "place-0")).toBe(false);
    expect(stored.some((entry) => entry.location.providerPlaceId === "place-1")).toBe(false);
  });
});
