"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { applyDevSceneOverride, useDevSceneOverride } from "@/lib/weatherScene/devSceneOverride";
import type { WeatherSceneDescriptor } from "@/lib/weatherScene/types";
import { cloudTileBackgroundImage, seedFromString } from "./cloudShapes";
import { randomLightningBolt, type LightningBolt } from "./lightningBolt";
import { visualProfileFor, type WeatherVisualProfile } from "./weatherVisualProfile";
import { WeatherParticles } from "./WeatherParticles";

const CROSSFADE_MS = 900;
const LIGHTNING_MIN_MS = 6000;
const LIGHTNING_MAX_MS = 14000;
/** Sun/moon always render at the same fixed screen position — a distant object doesn't need to move per weather condition. */
const CELESTIAL_POSITION: CSSProperties = { left: "76%", top: "13%" };
// Larger than the original 300x120 — gives cloud clusters (and their
// safe-margin clamping, see `cloudShapes.ts`) more inherent room before
// any shape needs to be pulled in from the edge.
const CLOUD_TILE_SIZE = { width: 420, height: 170 };

const NEUTRAL_PROFILE = visualProfileFor({ condition: "unknown", intensity: "light", sky: "clear", precipitationType: "none", lightning: false, dayPhase: "day" });

interface Layer {
  key: string;
  profile: WeatherVisualProfile;
}

/** Each cloud layer's SVG tile is generated once per (profile, layer) pair and memoized — cheap, but there's no reason to rebuild the SVG string every render when the profile hasn't changed. */
function CloudLayers({ profile }: { profile: WeatherVisualProfile }) {
  const tiles = useMemo(
    () =>
      profile.cloudLayers.map((layer) => ({
        key: layer.key,
        reverse: layer.reverse,
        durationSec: layer.durationSec,
        image: cloudTileBackgroundImage({
          width: CLOUD_TILE_SIZE.width,
          height: CLOUD_TILE_SIZE.height,
          clusterCount: layer.clusterCount,
          scale: layer.scale,
          seed: seedFromString(`${profile.id}-${layer.key}`),
          topColor: layer.topColor,
          bottomColor: layer.bottomColor,
          fillAlpha: layer.fillAlpha,
          edgeBlur: layer.edgeBlurPx,
          baseYFraction: layer.baseYFraction,
        }),
      })),
    [profile],
  );

  return (
    <>
      {tiles.map((tile) => (
        <div
          key={tile.key}
          aria-hidden
          className={`weather-cloud-layer${tile.reverse ? " is-reverse" : ""}`}
          style={{ backgroundImage: tile.image, animationDuration: `${tile.durationSec}s` }}
        />
      ))}
    </>
  );
}

/** "Mist passing through the scene" — layered horizontal bands, staggered vertical position/opacity/speed, never a flat overlay. Only rendered for fog. */
function FogBands({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className={`weather-fog-band${i % 2 === 1 ? " is-reverse" : ""}`}
          style={
            {
              top: `${8 + (i * 78) / Math.max(1, count - 1)}%`,
              "--band-alpha": (0.2 + (i % 3) * 0.07).toString(),
              "--band-duration": `${55 + i * 13}s`,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}

/** Two concentric layers (bloom + core), never an off-center highlight — see `globals.css`'s comment on why that reads as a "planet" instead of atmospheric light. */
function CelestialBody({ profile }: { profile: WeatherVisualProfile }) {
  if (profile.sunVisible) {
    return (
      <>
        <div aria-hidden className="weather-scene-sun-bloom" style={CELESTIAL_POSITION} />
        <div aria-hidden className="weather-scene-sun-core" style={CELESTIAL_POSITION} />
      </>
    );
  }
  if (profile.moonVisible) {
    return (
      <>
        <div aria-hidden className="weather-scene-moon-bloom" style={CELESTIAL_POSITION} />
        <div aria-hidden className="weather-scene-moon-core" style={CELESTIAL_POSITION} />
      </>
    );
  }
  return null;
}

/**
 * One crossfading atmosphere, entirely parameterized by a resolved
 * `WeatherVisualProfile` (see `weatherVisualProfile.ts` — the single
 * source every layer below reads from). Depth order (back to front):
 * sky gradient, stars, sun/moon, cloud layers, fog bands, haze — sun/
 * moon sit BELOW the cloud layers so a partly-cloudy scene's drifting
 * near layer visibly passes in front of them.
 */
function SceneLayer({ profile }: { profile: WeatherVisualProfile }) {
  return (
    <>
      <div className="weather-scene-sky" style={{ background: `linear-gradient(180deg, ${profile.skyTop} 0%, ${profile.skyBottom} 100%)` }} />
      {profile.starDots !== "none" ? <div aria-hidden className={`weather-scene-stars${profile.starDots === "sparse" ? " is-sparse" : ""}`} /> : null}
      <CelestialBody profile={profile} />
      <CloudLayers profile={profile} />
      <FogBands count={profile.fogBandCount} />
      {profile.hazeOpacity > 0 ? <div aria-hidden className="weather-scene-haze" style={{ opacity: profile.hazeOpacity }} /> : null}
    </>
  );
}

/**
 * The results-page weather background. Renders the NEUTRAL profile
 * (`NEUTRAL_PROFILE` — no clouds, no sun/moon, no precipitation) when
 * `scene` is `null` (loading, or the form screen before any analysis
 * exists) or when `scene.dataStatus` is `"unavailable"` — never guesses
 * "clear" when data failed. When the resolved scene changes (e.g. after
 * searching a different trip), the old and new atmospheres crossfade via
 * opacity rather than snapping. A constant, condition-independent
 * `.weather-scene-vignette` (edge depth) and `.weather-scene-scrim`
 * (readability floor) sit above every atmosphere layer, below the
 * content — see `globals.css`'s stacking-order comments for the full
 * z-index rationale (weather visuals: z-index 0; particles/lightning/
 * scrim: z-index 1; content: z-index 2 — sun/moon/clouds can NEVER
 * render above a card). In development only, a `DevSceneOverride` (see
 * `devSceneOverride.ts`) can substitute the resolved compositional
 * fields for visual preview — never in production, and never affecting
 * the underlying `scene` object or any analytical model.
 */
export function WeatherSceneBackground({
  scene,
  className,
  children,
}: {
  scene: WeatherSceneDescriptor | null;
  /** Merged onto the root `.weather-scene` element — e.g. full-page layout utility classes, matching how the static `.atmosphere-bg` is applied directly to its container. */
  className?: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const devOverride = useDevSceneOverride();
  const effectiveScene = process.env.NODE_ENV === "development" && scene && devOverride ? applyDevSceneOverride(scene, devOverride) : scene;
  const isResolved = effectiveScene?.dataStatus === "resolved";

  const profile = useMemo<WeatherVisualProfile>(() => {
    if (!isResolved || !effectiveScene) return NEUTRAL_PROFILE;
    return visualProfileFor({
      condition: effectiveScene.condition,
      intensity: effectiveScene.intensity,
      sky: effectiveScene.sky,
      precipitationType: effectiveScene.precipitationType,
      lightning: effectiveScene.lightning,
      dayPhase: effectiveScene.dayPhase,
    });
  }, [isResolved, effectiveScene]);

  const trackKey = `${profile.id}-${isResolved ? effectiveScene!.dayPhase : "day"}`;

  const [layers, setLayers] = useState<Layer[]>(() => [{ key: trackKey, profile }]);
  // "Adjusting state when a prop changes" during render, per React's own
  // guidance — not inside an effect — so the new crossfade layer is added
  // in the SAME render the scene actually changed in, with no extra
  // render/effect round-trip.
  const [trackedKey, setTrackedKey] = useState(trackKey);
  if (trackKey !== trackedKey) {
    setTrackedKey(trackKey);
    setLayers((prev) => [...prev.slice(-1), { key: `${trackKey}-${Date.now()}`, profile }]);
  }

  useEffect(() => {
    if (layers.length < 2) return;
    const delay = reducedMotion ? 0 : CROSSFADE_MS;
    const timeout = setTimeout(() => setLayers((prev) => prev.slice(-1)), delay);
    return () => clearTimeout(timeout);
  }, [layers, reducedMotion]);

  const lightningActive = profile.lightning;
  const [flashing, setFlashing] = useState(false);
  const [bolt, setBolt] = useState<LightningBolt | null>(null);

  useEffect(() => {
    if (!lightningActive || reducedMotion) return;
    let timeout: ReturnType<typeof setTimeout>;
    function scheduleFlash() {
      const delay = LIGHTNING_MIN_MS + Math.random() * (LIGHTNING_MAX_MS - LIGHTNING_MIN_MS);
      timeout = setTimeout(() => {
        setBolt(randomLightningBolt());
        setFlashing(true);
        setTimeout(() => setFlashing(false), 260);
        scheduleFlash();
      }, delay);
    }
    scheduleFlash();
    return () => clearTimeout(timeout);
  }, [lightningActive, reducedMotion]);

  return (
    <div className={`weather-scene${className ? ` ${className}` : ""}`}>
      {layers.map((layer, index) => (
        <div
          key={layer.key}
          aria-hidden
          className="weather-scene-layer"
          style={{ opacity: index === layers.length - 1 ? 1 : 0, transitionDuration: reducedMotion ? "0ms" : `${CROSSFADE_MS}ms` }}
        >
          <SceneLayer profile={layer.profile} />
        </div>
      ))}
      {!reducedMotion && isResolved ? <WeatherParticles precipitation={profile.precipitation} /> : null}
      {lightningActive ? (
        <>
          <div className={`weather-scene-lightning ${flashing ? "is-flashing" : ""}`} />
          {bolt ? (
            <svg
              aria-hidden
              className={`weather-scene-bolt ${flashing ? "is-flashing" : ""}`}
              style={{ left: `${Math.max(4, bolt.leftPercent - 11)}%` }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <path d={bolt.path} stroke="#eef3ff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px rgba(238,243,255,0.85))" }} />
              {bolt.branchPath ? <path d={bolt.branchPath} stroke="#eef3ff" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity={0.75} /> : null}
            </svg>
          ) : null}
        </>
      ) : null}
      <div aria-hidden className="weather-scene-vignette" />
      <div className="weather-scene-scrim" />
      <div className="weather-scene-content">{children}</div>
    </div>
  );
}
