import { getOrFetch } from "@/lib/cache/requestCache";
import { downloadGtfsStatic } from "./fetchGtfsStatic";
import { GtfsStaticStore } from "./store";

/**
 * TransLink republishes this feed weekly (Fridays) — there is no value in
 * re-downloading and re-parsing it more than a small number of times per
 * day, and doing so would waste real time (the raw ZIP is tens of MB) for
 * data that essentially never changes within a day. 12 hours is a
 * conservative in-between: fresh enough to pick up a same-week
 * republish within half a day, far short of the weekly real update
 * cadence. See docs/architecture.md "Transit data pipeline" and
 * docs/decisions/0007-transit-data-integration.md.
 */
const GTFS_STATIC_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const GTFS_STATIC_CACHE_KEY = "gtfs-static:translink";

/**
 * Returns a shared, cached `GtfsStaticStore`, downloading and indexing the
 * feed only on a cache miss. Uses the same in-flight-deduplicating,
 * per-process `getOrFetch` cache as weather/traffic — see its doc comment
 * for the "not a distributed cache, doesn't survive restarts" caveat,
 * which is fine here since a cold process simply re-downloads once.
 */
export async function getGtfsStaticStore(signal?: AbortSignal): Promise<GtfsStaticStore> {
  return getOrFetch(GTFS_STATIC_CACHE_KEY, GTFS_STATIC_CACHE_TTL_MS, async () => {
    const raw = await downloadGtfsStatic(signal);
    return new GtfsStaticStore(raw);
  });
}
