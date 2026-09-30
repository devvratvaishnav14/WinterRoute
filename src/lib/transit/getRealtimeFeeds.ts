import { getOrFetch } from "@/lib/cache/requestCache";
import {
  fetchServiceAlerts,
  fetchTripUpdates,
  fetchVehiclePositions,
  type TranslinkAlert,
  type TranslinkFeed,
  type TranslinkTripUpdate,
  type TranslinkVehiclePosition,
} from "./providers/translinkRealtime";

/**
 * TransLink's real, confirmed quota is 1,000 requests/day *per API key*
 * (from TransLink's own Terms of Use — not a guessed round number). Each
 * of the three realtime feeds covers the entire system already, so
 * polling more often only shortens staleness — it never returns more
 * data, which is exactly why WinterRoute fetches each feed once per cache
 * window and matches locally rather than querying per segment or per
 * render.
 *
 * A 5-minute TTL across all 3 feeds gives a worst case of
 * 3 feeds × (24h × 60 / 5) = 864 requests/day under continuous traffic —
 * comfortably under the 1,000/day cap with real headroom for the GTFS
 * static download (12h TTL, negligible by comparison) and any manual
 * testing. See docs/architecture.md "Transit realtime cache TTL" and
 * docs/decisions/0007-transit-data-integration.md.
 */
const REALTIME_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getTripUpdatesFeed(signal?: AbortSignal): Promise<TranslinkFeed<TranslinkTripUpdate>> {
  return getOrFetch("translink:tripUpdates", REALTIME_CACHE_TTL_MS, () => fetchTripUpdates(signal));
}

export async function getVehiclePositionsFeed(signal?: AbortSignal): Promise<TranslinkFeed<TranslinkVehiclePosition>> {
  return getOrFetch("translink:vehiclePositions", REALTIME_CACHE_TTL_MS, () => fetchVehiclePositions(signal));
}

export async function getServiceAlertsFeed(signal?: AbortSignal): Promise<TranslinkFeed<TranslinkAlert>> {
  return getOrFetch("translink:serviceAlerts", REALTIME_CACHE_TTL_MS, () => fetchServiceAlerts(signal));
}
