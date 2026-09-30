"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Route } from "@/lib/route/types";
import type { RouteMapPreviewHandle } from "@/components/map/RouteMap";
import { frameAtElapsedMs } from "@/lib/preview/engine";
import { buildPreviewSchedule, totalPreviewDurationMs } from "@/lib/preview/timing";
import type { PreviewSegmentSchedule, PreviewStatus } from "@/lib/preview/types";

/**
 * The animation loop's only dependency on the outside world — injectable
 * so `usePreviewPlayback` is fully unit-testable with a fake, manually-
 * advanced clock instead of real `requestAnimationFrame`/timers.
 */
export interface PreviewClock {
  now(): number;
  requestFrame(cb: (t: number) => void): number;
  cancelFrame(id: number): void;
}

export const REAL_PREVIEW_CLOCK: PreviewClock = {
  now: () => performance.now(),
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

export interface UsePreviewPlaybackResult {
  status: PreviewStatus;
  /** The segment currently "active" in the preview — ResultsView feeds this into the SAME `highlightedSegmentId` state the map<->itinerary click interaction already uses, so both stay in sync with playback. */
  activeSegmentId: string | null;
  /** A short, infrequent status string for an `aria-live` region — updated only at meaningful transitions (start, each new segment, completion), never every frame. */
  announcement: string;
  /** Pass this straight to `<RouteMap previewHandleRef={...} />`. */
  previewHandleRef: MutableRefObject<RouteMapPreviewHandle | null>;
  canPlay: boolean;
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  replay(): void;
}

function announcementForFrameSegment(route: Route, segmentId: string, mode: string): string {
  if (mode === "bus" || mode === "rail") {
    const segment = route.segments.find((s) => s.id === segmentId);
    const label = segment?.transitLine?.shortName;
    return label ? `${label} segment` : `${mode === "rail" ? "Rail" : "Bus"} segment`;
  }
  return `${mode.charAt(0).toUpperCase()}${mode.slice(1)} segment`;
}

/**
 * "Preview my commute" — a compressed, visual-only animation of a marker
 * moving along the route's own already-computed geometry. Owns:
 * playback status, which segment is "active" (fed into the existing
 * map<->itinerary highlight state), and imperative marker updates via
 * `RouteMapPreviewHandle` (never React state per frame — see
 * `docs/architecture.md` "Preview My Commute architecture").
 *
 * `reducedMotion`: the marker still moves segment-to-segment (so
 * highlighting/announcements work identically), but WITHIN a segment it
 * holds at that segment's midpoint rather than continuously gliding —
 * "no continuous marker movement," per the stepped-preview requirement,
 * without a second parallel implementation to maintain.
 *
 * Clicking a map/itinerary segment while the preview is playing or
 * paused is intentionally NOT wired to jump the preview — the simpler,
 * more robust choice over reconciling two competing "what's active"
 * sources. `ResultsView` disables manual segment selection for the
 * duration of playback instead (see its own doc comment).
 *
 * The animation loop itself is a plain function stored in a ref
 * (`tickFnRef`, assigned once via `useEffect`), reading everything it
 * needs (route/schedule/clock/...) from OTHER refs kept in sync every
 * render — never a `useCallback` that closes over changing props and
 * recursively schedules itself, which `eslint-plugin-react-hooks` (this
 * project's stricter ruleset) flags as an unsafe self-referencing
 * pattern. Refs are only ever written inside effects/event handlers,
 * never during render.
 */
export function usePreviewPlayback(route: Route, reducedMotion: boolean, clock: PreviewClock = REAL_PREVIEW_CLOCK): UsePreviewPlaybackResult {
  const schedule = useMemo<PreviewSegmentSchedule[]>(() => buildPreviewSchedule(route), [route]);
  const totalMs = useMemo(() => totalPreviewDurationMs(schedule), [schedule]);

  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const previewHandleRef = useRef<RouteMapPreviewHandle | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const startTimestampRef = useRef(0);
  const pausedElapsedRef = useRef(0);
  const activeSegmentIdRef = useRef<string | null>(null);

  const routeRef = useRef(route);
  const scheduleRef = useRef(schedule);
  const totalMsRef = useRef(totalMs);
  const reducedMotionRef = useRef(reducedMotion);
  const clockRef = useRef(clock);

  // Keep the "latest value" refs in sync after every commit — never
  // during render itself (refs are only for effects/event handlers).
  useEffect(() => {
    routeRef.current = route;
    scheduleRef.current = schedule;
    totalMsRef.current = totalMs;
    reducedMotionRef.current = reducedMotion;
    clockRef.current = clock;
  });

  const tickFnRef = useRef<(now: number) => void>(() => {});
  useEffect(() => {
    tickFnRef.current = (now: number) => {
      const route = routeRef.current;
      const schedule = scheduleRef.current;
      const totalMs = totalMsRef.current;

      const elapsed = now - startTimestampRef.current;
      let frame = frameAtElapsedMs(route, schedule, elapsed);
      if (!frame) {
        rafIdRef.current = null;
        setStatus("idle");
        return;
      }

      if (reducedMotionRef.current) {
        const activeSchedule = schedule.find((s) => s.segmentId === frame!.segmentId);
        if (activeSchedule) {
          const midpoint = (activeSchedule.startMs + activeSchedule.endMs) / 2;
          frame = frameAtElapsedMs(route, schedule, midpoint) ?? frame;
        }
      }

      previewHandleRef.current?.setPreviewMarker(frame.position, frame.mode);

      if (frame.segmentId !== activeSegmentIdRef.current) {
        activeSegmentIdRef.current = frame.segmentId;
        setActiveSegmentId(frame.segmentId);
        setAnnouncement(announcementForFrameSegment(route, frame.segmentId, frame.mode));
      }

      if (elapsed >= totalMs) {
        rafIdRef.current = null;
        setStatus("complete");
        setAnnouncement("Preview complete");
        return;
      }

      rafIdRef.current = clockRef.current.requestFrame(tickFnRef.current);
    };
  }, []);

  const stopAnimationLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      clockRef.current.cancelFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (scheduleRef.current.length === 0) return;
    stopAnimationLoop();
    pausedElapsedRef.current = 0;
    activeSegmentIdRef.current = null;
    startTimestampRef.current = clockRef.current.now();
    setStatus("playing");
    setAnnouncement("Preview started");
    rafIdRef.current = clockRef.current.requestFrame(tickFnRef.current);
  }, [stopAnimationLoop]);

  const pause = useCallback(() => {
    stopAnimationLoop();
    pausedElapsedRef.current = clockRef.current.now() - startTimestampRef.current;
    setStatus((current) => (current === "playing" ? "paused" : current));
  }, [stopAnimationLoop]);

  const resume = useCallback(() => {
    startTimestampRef.current = clockRef.current.now() - pausedElapsedRef.current;
    setStatus((current) => {
      if (current !== "paused") return current;
      rafIdRef.current = clockRef.current.requestFrame(tickFnRef.current);
      return "playing";
    });
  }, []);

  const stop = useCallback(() => {
    stopAnimationLoop();
    pausedElapsedRef.current = 0;
    activeSegmentIdRef.current = null;
    setStatus("idle");
    setActiveSegmentId(null);
    setAnnouncement("");
    previewHandleRef.current?.setPreviewMarker(null, null);
  }, [stopAnimationLoop]);

  const replay = useCallback(() => {
    start();
  }, [start]);

  useEffect(() => stopAnimationLoop, [stopAnimationLoop]);

  return { status, activeSegmentId, announcement, previewHandleRef, canPlay: schedule.length > 0, start, pause, resume, stop, replay };
}
