"use client";

import { useSyncExternalStore } from "react";
import type {
  WeatherSceneCondition,
  WeatherSceneDayPhase,
  WeatherSceneDescriptor,
  WeatherSceneIntensity,
  WeatherScenePrecipitationType,
  WeatherSceneSky,
} from "./types";

/**
 * A DEVELOPMENT-ONLY visual override for the weather scene — the
 * "Weather Scene Lab" (see `WeatherSceneLab.tsx`) — so every visual
 * combination can be previewed without waiting for matching real
 * weather. Same `useSyncExternalStore` external-store pattern already
 * used by `lib/storage/recentTrips.ts` — module-level state + a
 * subscriber set — rather than prop-drilling an override through
 * `TripForm` -> `ResultsView` -> `DetailsDrawer` and back down into
 * `WeatherSceneBackground`.
 *
 * The override carries the FULL compositional tuple (not just
 * condition+dayPhase) because several named presets need a
 * precipitation intensity/type independent of what `resolveWeatherScene`
 * would normally derive from `condition` alone — e.g. "Thunderstorm +
 * Light Rain" needs `condition: "thunderstorm"` (for the storm sky
 * mood) but `intensity: "light"` (whereas a REAL thunderstorm always
 * derives `"heavy"`), and a genuine dry thunderstorm needs
 * `precipitationType: "none"` with `lightning: true`.
 *
 * `applyDevSceneOverride` never mutates the resolved
 * `WeatherSceneDescriptor` and is only ever called from
 * `WeatherSceneBackground` — it has no way to reach, and never reaches,
 * any risk/duration/timing/weather-analysis code. See
 * docs/architecture.md "Weather scene architecture."
 */
export interface DevSceneOverride {
  label: string;
  condition: WeatherSceneCondition;
  dayPhase: WeatherSceneDayPhase;
  sky: WeatherSceneSky;
  precipitationType: WeatherScenePrecipitationType;
  intensity: WeatherSceneIntensity;
  lightning: boolean;
}

let currentOverride: DevSceneOverride | null = null;
const listeners = new Set<() => void>();

export function setDevSceneOverride(next: DevSceneOverride | null): void {
  currentOverride = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): DevSceneOverride | null {
  return currentOverride;
}

function getServerSnapshot(): DevSceneOverride | null {
  return null;
}

export function useDevSceneOverride(): DevSceneOverride | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Purely visual — returns a NEW descriptor, never mutates `scene`. */
export function applyDevSceneOverride(scene: WeatherSceneDescriptor, override: DevSceneOverride | null): WeatherSceneDescriptor {
  if (!override) return scene;
  return {
    ...scene,
    condition: override.condition,
    dayPhase: override.dayPhase,
    sky: override.sky,
    precipitationType: override.precipitationType,
    intensity: override.intensity,
    lightning: override.lightning,
    dataStatus: "resolved",
    derivationNotes: [...scene.derivationNotes, "Development-only visual override active — presentation only, does not affect risk/duration/timing/weather analysis."],
  };
}
