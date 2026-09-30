import { describe, expect, it } from "vitest";
import { findVehicleObservation, VEHICLE_POSITION_STALENESS_MS } from "./vehiclePositions";
import type { TranslinkVehiclePosition } from "./providers/translinkRealtime";

const NOW = new Date("2026-09-24T15:00:00Z");

function vehicle(overrides: Partial<TranslinkVehiclePosition> = {}): TranslinkVehiclePosition {
  return {
    tripId: "T1",
    routeId: "R1",
    vehicleId: "V1",
    latitude: 49.28,
    longitude: -123.1,
    observedAt: NOW,
    ...overrides,
  };
}

describe("findVehicleObservation", () => {
  it("returns a 'current' observation for a fresh, matching vehicle", () => {
    const result = findVehicleObservation([vehicle()], "T1", NOW);
    expect(result?.freshness).toBe("current");
    expect(result).toMatchObject({ providerVehicleId: "V1", latitude: 49.28, longitude: -123.1 });
  });

  it("returns undefined when no vehicle is reported for the trip", () => {
    expect(findVehicleObservation([vehicle({ tripId: "OTHER" })], "T1", NOW)).toBeUndefined();
  });

  it("classifies a position older than the staleness threshold as 'stale'", () => {
    const oldObservation = new Date(NOW.getTime() - VEHICLE_POSITION_STALENESS_MS - 1000);
    const result = findVehicleObservation([vehicle({ observedAt: oldObservation })], "T1", NOW);
    expect(result?.freshness).toBe("stale");
  });

  it("returns undefined (not a fabricated 'current') when the vehicle has no timestamp to assess freshness with", () => {
    const result = findVehicleObservation([vehicle({ observedAt: undefined })], "T1", NOW);
    expect(result).toBeUndefined();
  });

  it("returns undefined when the vehicle has no position coordinates", () => {
    const result = findVehicleObservation([vehicle({ latitude: undefined, longitude: undefined })], "T1", NOW);
    expect(result).toBeUndefined();
  });

  it("treats a future-dated observation (clock skew) as stale rather than current", () => {
    const future = new Date(NOW.getTime() + 60_000);
    const result = findVehicleObservation([vehicle({ observedAt: future })], "T1", NOW);
    expect(result?.freshness).toBe("stale");
  });
});
