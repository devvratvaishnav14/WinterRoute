// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { ResolvedLocation } from "@/lib/route/types";
import { addRecentTrip, getRecentTrips, getRecentTripsServerSnapshot, getRecentTripsSnapshot } from "./recentTrips";

const STORAGE_KEY = "winterroute:recentTrips:v1";

const origin: ResolvedLocation = { label: "SFU Burnaby", latitude: 49.2781, longitude: -122.9199, providerPlaceId: "place-sfu" };
const destination: ResolvedLocation = {
  label: "Downtown Vancouver",
  latitude: 49.2827,
  longitude: -123.1207,
  providerPlaceId: "place-downtown",
};

beforeEach(() => {
  localStorage.clear();
});

describe("getRecentTrips", () => {
  it("returns [] when nothing is stored", () => {
    expect(getRecentTrips()).toEqual([]);
  });

  it("returns [] rather than throwing for corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not json at all {{{");
    expect(getRecentTrips()).toEqual([]);
  });

  it("returns [] for a stored trip with an invalid mode", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        items: [{ origin, destination, mode: "hovercraft", timePreference: "arriveBy", lastUsedAt: "x" }],
      }),
    );
    expect(getRecentTrips()).toEqual([]);
  });
});

describe("addRecentTrip", () => {
  it("adds a trip and persists it", () => {
    addRecentTrip({ origin, destination, mode: "bus", timePreference: "arriveBy" });
    const stored = getRecentTrips();
    expect(stored).toHaveLength(1);
    expect(stored[0].origin.label).toBe("SFU Burnaby");
    expect(stored[0].mode).toBe("bus");
  });

  it("treats the same origin/destination/mode as one trip regardless of time preference", () => {
    addRecentTrip({ origin, destination, mode: "bus", timePreference: "arriveBy" });
    addRecentTrip({ origin, destination, mode: "bus", timePreference: "leaveAt" });

    const stored = getRecentTrips();
    expect(stored).toHaveLength(1);
    expect(stored[0].timePreference).toBe("leaveAt"); // most recent choice wins
  });

  it("treats a different mode for the same origin/destination as a different trip", () => {
    addRecentTrip({ origin, destination, mode: "bus", timePreference: "arriveBy" });
    addRecentTrip({ origin, destination, mode: "car", timePreference: "arriveBy" });

    expect(getRecentTrips()).toHaveLength(2);
  });

  it("caps the list at 8 entries", () => {
    for (let i = 0; i < 10; i++) {
      addRecentTrip({
        origin: { ...origin, providerPlaceId: `place-origin-${i}` },
        destination,
        mode: "bus",
        timePreference: "arriveBy",
      });
    }
    expect(getRecentTrips()).toHaveLength(8);
  });
});

describe("getRecentTripsSnapshot", () => {
  it("returns a referentially stable value across calls when nothing changed", () => {
    addRecentTrip({ origin, destination, mode: "bus", timePreference: "arriveBy" });
    const first = getRecentTripsSnapshot();
    const second = getRecentTripsSnapshot();
    expect(first).toBe(second);
  });

  it("returns a new reference after addRecentTrip changes the underlying data", () => {
    addRecentTrip({ origin, destination, mode: "bus", timePreference: "arriveBy" });
    const before = getRecentTripsSnapshot();
    addRecentTrip({ origin, destination, mode: "car", timePreference: "arriveBy" });
    const after = getRecentTripsSnapshot();
    expect(after).not.toBe(before);
  });
});

describe("getRecentTripsServerSnapshot", () => {
  it("returns a referentially stable empty array across calls", () => {
    // useSyncExternalStore requires this — a fresh [] literal each call
    // makes React warn about (and risk) an infinite render loop.
    expect(getRecentTripsServerSnapshot()).toBe(getRecentTripsServerSnapshot());
  });
});
