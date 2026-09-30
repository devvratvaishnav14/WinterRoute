import type { TranslinkVehiclePosition } from "./providers/translinkRealtime";
import type { TransitVehicleFreshness, TransitVehicleObservation } from "./types";

/**
 * How old a vehicle's own reported observation timestamp may be, relative
 * to "now," before it's no longer treated as the vehicle's current
 * location. Set to match the realtime feed's own cache TTL
 * (`REALTIME_CACHE_TTL_MS` in `getRealtimeFeeds.ts`) — a position can't be
 * meaningfully "fresher" than how often WinterRoute itself refetches the
 * feed, and a position older than one full refresh window is stale by
 * construction, not just a guess.
 */
export const VEHICLE_POSITION_STALENESS_MS = 5 * 60 * 1000;

/**
 * Finds the vehicle currently serving a matched trip, if TransLink is
 * reporting one, and classifies its freshness against `now`. A position
 * with no timestamp at all can't have its freshness assessed and is
 * treated as unusable (not assumed fresh) — see docs/architecture.md
 * "Vehicle Positions: freshness, not just presence."
 */
export function findVehicleObservation(
  entities: TranslinkVehiclePosition[],
  tripId: string,
  now: Date,
): TransitVehicleObservation | undefined {
  const vehicle = entities.find((v) => v.tripId === tripId);
  if (!vehicle) return undefined;
  if (vehicle.latitude == null || vehicle.longitude == null) return undefined;
  if (!vehicle.observedAt) return undefined;

  const ageMs = now.getTime() - vehicle.observedAt.getTime();
  const freshness: TransitVehicleFreshness = ageMs >= 0 && ageMs <= VEHICLE_POSITION_STALENESS_MS ? "current" : "stale";

  return {
    providerVehicleId: vehicle.vehicleId,
    latitude: vehicle.latitude,
    longitude: vehicle.longitude,
    observedAt: vehicle.observedAt,
    freshness,
    currentStopSequence: vehicle.currentStopSequence,
    currentStatus: vehicle.currentStatus,
    tripId: vehicle.tripId,
  };
}
