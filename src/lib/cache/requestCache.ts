/**
 * A small in-memory, per-process TTL cache with in-flight deduplication —
 * not a distributed cache, not backed by a database (none exists yet; see
 * docs/architecture.md). Its job is narrow: stop two near-simultaneous
 * requests for the *same* thing (e.g. a double page refresh) from
 * triggering duplicate upstream calls, and avoid re-querying an external
 * provider on every request within a short window. It does not promise
 * freshness across server restarts or multiple server instances —
 * documented as an accepted limitation wherever it's used (traffic,
 * transit), not a gap discovered later.
 *
 * Shared by `lib/traffic/` and `lib/transit/` — originally written for
 * traffic, moved here once transit needed the identical mechanism rather
 * than a copy.
 *
 * Storing the in-flight `Promise` itself (not just the resolved value)
 * means concurrent callers with the same key share one upstream request
 * instead of each starting their own.
 */

interface CacheEntry<T> {
  expiresAt: number;
  value: Promise<T>;
}

const cache = new Map<string, CacheEntry<unknown>>();

export async function getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const promise = fetcher();
  cache.set(key, { expiresAt: now + ttlMs, value: promise });

  // A failed fetch shouldn't poison the cache for the next real attempt.
  promise.catch(() => {
    if (cache.get(key)?.value === promise) cache.delete(key);
  });

  return promise;
}

export function clearRequestCache(): void {
  cache.clear();
}
