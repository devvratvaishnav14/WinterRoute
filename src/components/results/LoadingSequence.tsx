"use client";

import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import type { RoutePreviewState } from "@/components/trip/RoutePreview";
import type { WeatherPreviewState } from "@/components/trip/WeatherPreview";
import type { TrafficPreviewState } from "@/components/trip/TrafficPreview";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";

type Stage = { key: string; label: string; done: boolean };

/**
 * Truthful, staged loading text — each line reflects a real async state
 * that's actually in flight, never a fabricated progress percentage.
 * "Putting it together" only appears once route succeeded and the
 * weather/traffic/transit batch is still settling.
 */
export function LoadingSequence({
  routeState,
  weatherState,
  trafficState,
  transitState,
}: {
  routeState: RoutePreviewState | null;
  weatherState: WeatherPreviewState | null;
  trafficState: TrafficPreviewState | null;
  transitState: TransitPreviewState | null;
}) {
  const routeLoading = routeState?.status === "loading";

  const stages: Stage[] = routeLoading
    ? [{ key: "route", label: "Checking your route…", done: false }]
    : [
        { key: "weather", label: "Reading weather…", done: weatherState?.status !== "loading" },
        { key: "traffic", label: "Checking traffic…", done: trafficState?.status !== "loading" },
        { key: "transit", label: "Checking transit…", done: transitState?.status !== "loading" },
        {
          key: "combine",
          label: "Putting it together…",
          done: false,
        },
      ];

  const reducedMotion = useReducedMotion();

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-16 text-center">
      <div
        className={`h-8 w-8 rounded-full border-2 border-white/15 border-t-white/60 ${reducedMotion ? "" : "animate-spin"}`}
        aria-hidden
      />
      <ul className="space-y-1.5">
        {stages.map((stage) => (
          <li
            key={stage.key}
            className={`text-sm transition-opacity ${stage.done ? "text-white/35 line-through decoration-white/20" : "text-white/80"}`}
          >
            {stage.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
