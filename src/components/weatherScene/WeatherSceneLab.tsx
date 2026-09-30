"use client";

import { setDevSceneOverride, useDevSceneOverride, type DevSceneOverride } from "@/lib/weatherScene/devSceneOverride";
import { SCENE_PRESETS } from "./scenePresets";

function isActive(override: DevSceneOverride | null, preset: DevSceneOverride): boolean {
  return override?.label === preset.label;
}

/**
 * DEVELOPMENT-ONLY "Weather Scene Lab" — lets a developer inspect every
 * visual combination (21 named presets, see `scenePresets.ts`) without
 * waiting for matching real weather. VISUAL ONLY: `setDevSceneOverride`
 * only ever reaches `WeatherSceneBackground`'s rendering — it has no way
 * to touch route/weather analysis, risk, duration, or timing (see
 * `devSceneOverride.ts`). The caller is responsible for the
 * `process.env.NODE_ENV === "development"` gate (see `DetailsDrawer.tsx`)
 * so this never ships to production.
 */
export function WeatherSceneLab() {
  const override = useDevSceneOverride();

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-white/40">Visual preview only — does not change trip data.</p>
      <div className="flex flex-wrap gap-1.5">
        {SCENE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => setDevSceneOverride(isActive(override, preset) ? null : preset)}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
              isActive(override, preset)
                ? "border-sky-300/50 bg-sky-300/10 text-sky-100"
                : "border-white/15 text-white/60 hover:border-white/30 hover:text-white/90"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            setDevSceneOverride(override ? { ...override, dayPhase: override.dayPhase === "day" ? "night" : "day" } : { ...SCENE_PRESETS[0], dayPhase: "night" })
          }
          className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/60 transition-colors hover:border-white/30 hover:text-white/90"
        >
          {override?.dayPhase === "night" ? "Night" : "Day"}
        </button>
        {override ? (
          <button type="button" onClick={() => setDevSceneOverride(null)} className="text-[11px] text-white/40 underline hover:text-white/70">
            Use real forecast
          </button>
        ) : null}
      </div>
    </div>
  );
}
