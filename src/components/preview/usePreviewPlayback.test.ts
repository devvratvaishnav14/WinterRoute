// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { route, segment } from "@/lib/scoring/fixtures";
import { usePreviewPlayback, type PreviewClock } from "./usePreviewPlayback";

/** A fully manual, deterministic replacement for real rAF/performance.now — advanced only when the test calls `advance`. */
function createFakeClock(): { clock: PreviewClock; advance: (ms: number) => void; time: () => number } {
  let currentTime = 0;
  let pending: ((t: number) => void) | null = null;
  let nextId = 1;
  const clock: PreviewClock = {
    now: () => currentTime,
    requestFrame: (cb) => {
      pending = cb;
      return nextId++;
    },
    cancelFrame: () => {
      pending = null;
    },
  };
  return {
    clock,
    advance(ms: number) {
      currentTime += ms;
      const cb = pending;
      pending = null;
      cb?.(currentTime);
    },
    time: () => currentTime,
  };
}

const mixedRoute = route([
  segment({ id: "w1", mode: "walk", durationMinutes: 5 }),
  segment({ id: "bus1", mode: "bus", durationMinutes: 35 }),
  segment({ id: "w2", mode: "walk", durationMinutes: 5 }),
]);

describe("usePreviewPlayback — playback state machine", () => {
  it("starts idle with no active segment", () => {
    const { advance: _advance, clock } = createFakeClock();
    void _advance;
    const { result } = renderHook(() => usePreviewPlayback(mixedRoute, false, clock));
    expect(result.current.status).toBe("idle");
    expect(result.current.activeSegmentId).toBeNull();
  });

  it("start() moves to playing and announces the start", () => {
    const { clock } = createFakeClock();
    const { result } = renderHook(() => usePreviewPlayback(mixedRoute, false, clock));
    act(() => result.current.start());
    expect(result.current.status).toBe("playing");
    expect(result.current.announcement).toBe("Preview started");
  });

  it("advances the active segment as the fake clock ticks forward", () => {
    const { clock, advance } = createFakeClock();
    const { result } = renderHook(() => usePreviewPlayback(mixedRoute, false, clock));
    act(() => result.current.start());
    act(() => advance(0)); // first animation frame — real rAF also fires on the next frame, never synchronously within start()
    expect(result.current.activeSegmentId).toBe("w1");

    act(() => advance(1));
    expect(result.current.activeSegmentId).toBe("w1");

    // Jump well past the walk segment's compressed slice into the bus segment (but not so far it reaches the end).
    act(() => advance(5000));
    expect(result.current.activeSegmentId).toBe("bus1");
  });

  it("reaches 'complete' once elapsed time passes the total compressed duration", () => {
    const { clock, advance } = createFakeClock();
    const { result } = renderHook(() => usePreviewPlayback(mixedRoute, false, clock));
    act(() => result.current.start());
    act(() => advance(1)); // enter the running loop
    act(() => advance(60000)); // far past any possible total
    expect(result.current.status).toBe("complete");
    expect(result.current.announcement).toBe("Preview complete");
    expect(result.current.activeSegmentId).toBe("w2");
  });

  it("pause() stops advancing, resume() continues from where it left off", () => {
    const { clock, advance } = createFakeClock();
    const { result } = renderHook(() => usePreviewPlayback(mixedRoute, false, clock));
    act(() => result.current.start());
    act(() => advance(1));
    act(() => advance(2000));
    const pausedSegment = result.current.activeSegmentId;

    act(() => result.current.pause());
    expect(result.current.status).toBe("paused");

    // Time passes in the real world, but with nothing scheduled the preview must not silently advance.
    act(() => advance(50000));
    expect(result.current.activeSegmentId).toBe(pausedSegment);
    expect(result.current.status).toBe("paused");

    act(() => result.current.resume());
    expect(result.current.status).toBe("playing");
  });

  it("stop() returns to idle, clears the active segment, and clears the map marker", () => {
    const { clock, advance } = createFakeClock();
    const setPreviewMarker: string[] = [];
    const { result } = renderHook(() => usePreviewPlayback(mixedRoute, false, clock));
    act(() => result.current.start());
    act(() => advance(1));
    result.current.previewHandleRef.current = {
      setPreviewMarker: (position, mode) => setPreviewMarker.push(`${position ? "set" : "clear"}-${mode ?? "none"}`),
    };
    act(() => result.current.stop());
    expect(result.current.status).toBe("idle");
    expect(result.current.activeSegmentId).toBeNull();
    expect(setPreviewMarker.at(-1)).toBe("clear-none");
  });

  it("replay() restarts from the beginning after completion", () => {
    const { clock, advance } = createFakeClock();
    const { result } = renderHook(() => usePreviewPlayback(mixedRoute, false, clock));
    act(() => result.current.start());
    act(() => advance(1));
    act(() => advance(60000));
    expect(result.current.status).toBe("complete");

    act(() => result.current.replay());
    act(() => advance(0));
    expect(result.current.status).toBe("playing");
    expect(result.current.activeSegmentId).toBe("w1");
  });

  it("does not start playback for a route with no segments", () => {
    const { clock } = createFakeClock();
    const { result } = renderHook(() => usePreviewPlayback(route([]), false, clock));
    expect(result.current.canPlay).toBe(false);
    act(() => result.current.start());
    expect(result.current.status).toBe("idle");
  });
});

describe("usePreviewPlayback — reduced motion", () => {
  it("still advances through segments and announces transitions, without requiring continuous per-frame position changes", () => {
    const { clock, advance } = createFakeClock();
    const { result } = renderHook(() => usePreviewPlayback(mixedRoute, true, clock));
    act(() => result.current.start());
    act(() => advance(0));
    expect(result.current.activeSegmentId).toBe("w1");
    act(() => advance(5000));
    expect(result.current.activeSegmentId).toBe("bus1");
  });
});

describe("usePreviewPlayback — no side effects on trip data", () => {
  it("exposes only playback/marker state — no risk, duration, timing, or weather fields", () => {
    const { clock } = createFakeClock();
    const { result } = renderHook(() => usePreviewPlayback(mixedRoute, false, clock));
    const keys = Object.keys(result.current);
    for (const forbidden of ["risk", "duration", "timing", "weather", "route"]) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden))).toBe(false);
    }
  });
});
