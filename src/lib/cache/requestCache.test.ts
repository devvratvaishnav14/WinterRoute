import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRequestCache, getOrFetch } from "./requestCache";

afterEach(() => {
  clearRequestCache();
  vi.useRealTimers();
});

describe("getOrFetch", () => {
  it("calls the fetcher once for repeated calls with the same key within the TTL", async () => {
    const fetcher = vi.fn().mockResolvedValue("value");

    const [a, b] = await Promise.all([getOrFetch("key", 60_000, fetcher), getOrFetch("key", 60_000, fetcher)]);

    expect(a).toBe("value");
    expect(b).toBe("value");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("calls the fetcher again for a different key", async () => {
    const fetcher = vi.fn().mockResolvedValue("value");
    await getOrFetch("key-a", 60_000, fetcher);
    await getOrFetch("key-b", 60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("re-fetches after the TTL expires", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue("value");

    await getOrFetch("key", 1000, fetcher);
    vi.advanceTimersByTime(1500);
    await getOrFetch("key", 1000, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not poison the cache after a failed fetch — the next call retries", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce("value");

    await expect(getOrFetch("key", 60_000, fetcher)).rejects.toThrow("fail");
    // Allow the internal rejection handler (which clears the cache entry) to run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = await getOrFetch("key", 60_000, fetcher);

    expect(result).toBe("value");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
