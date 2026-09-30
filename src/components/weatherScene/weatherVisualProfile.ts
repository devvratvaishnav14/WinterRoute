import type {
  WeatherSceneCondition,
  WeatherSceneDayPhase,
  WeatherSceneIntensity,
  WeatherScenePrecipitationType,
  WeatherSceneSky,
} from "@/lib/weatherScene/types";
import { isMoonVisible, isSunVisible } from "./sunVisibility";

/**
 * THE single centralized "visual profile matrix" — every render surface
 * (sky gradient, cloud layers, precipitation particles, haze, fog bands,
 * sun/moon, lightning) reads its parameters from ONE
 * `WeatherVisualProfile` object, resolved here from the SAME compositional
 * fields `resolveWeatherScene` already produces (`condition`/`intensity`/
 * `sky`/`precipitationType`/`lightning`/`dayPhase`) — never independently
 * re-derived per renderer, so pieces can never disagree with each other.
 * This is the file to edit to change how a condition LOOKS; it never
 * changes what a condition IS (that stays entirely in
 * `lib/weatherScene/resolveWeatherScene.ts`).
 */

export interface CloudLayerVisual {
  key: string;
  clusterCount: number;
  /** Relative to the tile's own height — bigger = larger, more dominant cloud masses. */
  scale: number;
  /** The cloud SHAPE's own fill opacity (0-1) — a dense cloud is opaque near its core; a wispy one is more see-through. Independent of how many layers stack. */
  fillAlpha: number;
  edgeBlurPx: number;
  durationSec: number;
  reverse: boolean;
  topColor: string;
  bottomColor: string;
  baseYFraction: number;
}

export interface PrecipitationVisual {
  kind: "rain" | "snow";
  /** 0-1 relative density used for both particle count AND ordering assertions in tests ("heavy > moderate > light > drizzle"). */
  density: number;
  lengthPx: [number, number];
  /** px advanced per 60fps-equivalent frame. */
  speed: [number, number];
  opacity: [number, number];
  /** Extra ambient haze this precipitation itself contributes, on top of the scene's base haze. */
  hazeOpacity: number;
  /** Freezing precipitation gets a colder, slightly sharper/glassier streak treatment. */
  icy: boolean;
}

export interface WeatherVisualProfile {
  id: string;
  skyTop: string;
  skyBottom: string;
  cloudLayers: CloudLayerVisual[];
  precipitation: PrecipitationVisual | null;
  /** Ambient mist independent of precipitation (fog uses this heavily; everything else lightly or not at all). */
  hazeOpacity: number;
  /** >0 only for fog — layered horizontal mist bands, rendered separately from ordinary cloud shapes. */
  fogBandCount: number;
  sunVisible: boolean;
  moonVisible: boolean;
  /** "full" only for clear/mainly-clear night; "sparse" for partly-cloudy night (a few stars still showing through gaps); "none" everywhere else — overcast/foggy night never shows any (never visible through thick cloud/haze), matching `isMoonVisible`'s own rule. */
  starDots: "none" | "sparse" | "full";
  lightning: boolean;
  /** 0-1 — purely for test assertions that cloud coverage genuinely escalates (clear < mainly-clear < partly-cloudy < overcast <= storm). */
  cloudDensityScore: number;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Darkens AND cools a color toward navy/indigo — deliberately not a flat brightness multiply (which would just look like "day scene + dark filter"), a small blue-shift is mixed in so night reads as its own palette. */
function nightVariant(hex: string, darkenAmount = 0.6): string {
  const [r, g, b] = hexToRgb(hex);
  const navy: [number, number, number] = [10, 14, 30];
  const nr = r * (1 - darkenAmount) + navy[0] * darkenAmount;
  const ng = g * (1 - darkenAmount) + navy[1] * darkenAmount;
  const nb = b * (1 - darkenAmount) + navy[2] * darkenAmount;
  return rgbToHex(nr, ng, nb);
}

interface SkyOnlyPalette {
  day: { top: string; bottom: string };
  night: { top: string; bottom: string };
}

// Hand-authored day/night pairs for the sky-only conditions — night is its
// own deliberately-chosen navy/indigo palette, not a darkened day palette.
const SKY_PALETTES: Record<"clear" | "mainlyClear" | "partlyCloudy" | "overcast" | "fog", SkyOnlyPalette> = {
  clear: { day: { top: "#0f5fc0", bottom: "#7fc0f5" }, night: { top: "#040814", bottom: "#101f42" } },
  mainlyClear: { day: { top: "#1968c4", bottom: "#8ac4f2" }, night: { top: "#050a1a", bottom: "#132649" } },
  partlyCloudy: { day: { top: "#2c76c8", bottom: "#a2cbec" }, night: { top: "#0a1327", bottom: "#1d3157" } },
  overcast: { day: { top: "#59697c", bottom: "#8d97a4" }, night: { top: "#10141b", bottom: "#232a35" } },
  fog: { day: { top: "#98a0a6", bottom: "#c4c8cc" }, night: { top: "#383e46", bottom: "#565d66" } },
};

const PRECIP_DAY_PALETTE: Record<string, { top: string; bottom: string }> = {
  drizzle: { top: "#4c7aa8", bottom: "#8fabc4" },
  "light-rain": { top: "#3c6690", bottom: "#6f8caa" },
  "moderate-rain": { top: "#2c4d70", bottom: "#54708c" },
  "heavy-rain": { top: "#1c3350", bottom: "#3a4f68" },
  "freezing-drizzle": { top: "#45627a", bottom: "#7c9aac" },
  "freezing-rain": { top: "#33505f", bottom: "#5c7c8c" },
  "light-snow": { top: "#7f97ae", bottom: "#bdccd9" },
  "moderate-snow": { top: "#68809c", bottom: "#a3b4c6" },
  "heavy-snow": { top: "#66788e", bottom: "#9aa8b9" },
  "snow-showers": { top: "#4f86c4", bottom: "#a9c7e2" },
  storm: { top: "#1b1830", bottom: "#332c4a" },
};

function cloudLayer(
  key: string,
  clusterCount: number,
  scale: number,
  fillAlpha: number,
  edgeBlurPx: number,
  durationSec: number,
  reverse: boolean,
  topColor: string,
  bottomColor: string,
  baseYFraction: number,
): CloudLayerVisual {
  return { key, clusterCount, scale, fillAlpha, edgeBlurPx, durationSec, reverse, topColor, bottomColor, baseYFraction };
}

/** far/mid/near, escalating scale+contrast+speed, sharing one tint pair. */
function threeLayers(topColor: string, bottomColor: string, densityScale: number, isNight: boolean): CloudLayerVisual[] {
  const nightDim = isNight ? 0.82 : 1;
  return [
    cloudLayer("far", Math.round(3 * densityScale), 22 * densityScale, 0.55 * nightDim, 5, 210, false, topColor, bottomColor, 0.42),
    cloudLayer("mid", Math.round(3 * densityScale), 30 * densityScale, 0.72 * nightDim, 3.5, 140, false, topColor, bottomColor, 0.52),
    cloudLayer("near", Math.round(2 * densityScale), 40 * densityScale, 0.88 * nightDim, 2, 90, true, topColor, bottomColor, 0.62),
  ];
}

function twoLayers(topColor: string, bottomColor: string, isNight: boolean): CloudLayerVisual[] {
  const nightDim = isNight ? 0.82 : 1;
  return [
    cloudLayer("far", 2, 20, 0.42 * nightDim, 5, 190, false, topColor, bottomColor, 0.4),
    cloudLayer("near", 2, 26, 0.6 * nightDim, 3, 120, true, topColor, bottomColor, 0.5),
  ];
}

function precip(kind: "rain" | "snow", density: number, lengthPx: [number, number], speed: [number, number], opacity: [number, number], hazeOpacity: number, icy: boolean): PrecipitationVisual {
  return { kind, density, lengthPx, speed, opacity, hazeOpacity, icy };
}

export interface VisualProfileInput {
  condition: WeatherSceneCondition;
  intensity: WeatherSceneIntensity;
  sky: WeatherSceneSky;
  precipitationType: WeatherScenePrecipitationType;
  lightning: boolean;
  dayPhase: WeatherSceneDayPhase;
}

const NEUTRAL_PROFILE: WeatherVisualProfile = {
  id: "unknown",
  skyTop: "#141a24",
  skyBottom: "#1c232f",
  cloudLayers: [],
  precipitation: null,
  hazeOpacity: 0,
  fogBandCount: 0,
  sunVisible: false,
  moonVisible: false,
  starDots: "none",
  lightning: false,
  cloudDensityScore: 0,
};

export function visualProfileFor(input: VisualProfileInput): WeatherVisualProfile {
  const isNight = input.dayPhase === "night";
  const { condition, intensity, sky, precipitationType, lightning } = input;

  switch (condition) {
    case "clear": {
      const isMainlyClear = sky === "mainly-clear";
      const key = isMainlyClear ? "mainlyClear" : "clear";
      const palette = SKY_PALETTES[key][isNight ? "night" : "day"];
      return {
        ...NEUTRAL_PROFILE,
        id: isMainlyClear ? "mainly-clear" : "clear",
        skyTop: palette.top,
        skyBottom: palette.bottom,
        // Reuses the EXACT tint pair, blur, and alpha level partly-cloudy's
        // far layer already uses (never a bespoke low-alpha/low-count
        // recipe of its own — that's what previously read as faint,
        // isolated white smudges rather than actual small clouds), just
        // with fewer/smaller clusters so it visually sits between clear
        // (0 clouds) and partly-cloudy (2 fuller depth layers).
        cloudLayers: isMainlyClear ? [cloudLayer("far", 4, 17, 0.42 * (isNight ? 0.82 : 1), 5, 230, false, isNight ? "#8fa0c0" : "#ffffff", isNight ? "#3a4868" : "#c3d2e2", 0.32)] : [],
        hazeOpacity: 0,
        sunVisible: isSunVisible(sky, input.dayPhase),
        moonVisible: isMoonVisible(sky, input.dayPhase),
        starDots: isNight ? "full" : "none",
        cloudDensityScore: isMainlyClear ? 0.15 : 0,
      };
    }

    case "partly-cloudy": {
      const palette = SKY_PALETTES.partlyCloudy[isNight ? "night" : "day"];
      return {
        ...NEUTRAL_PROFILE,
        id: "partly-cloudy",
        skyTop: palette.top,
        skyBottom: palette.bottom,
        cloudLayers: twoLayers(isNight ? "#8fa0c0" : "#ffffff", isNight ? "#3a4868" : "#c3d2e2", isNight),
        hazeOpacity: 0.03,
        sunVisible: isSunVisible(sky, input.dayPhase),
        moonVisible: isMoonVisible(sky, input.dayPhase),
        // A few stars still show through the gaps between clouds — never
        // the full clear-night field, and never through overcast/fog.
        starDots: isNight ? "sparse" : "none",
        cloudDensityScore: 0.45,
      };
    }

    case "cloudy": {
      const palette = SKY_PALETTES.overcast[isNight ? "night" : "day"];
      return {
        ...NEUTRAL_PROFILE,
        id: "overcast",
        skyTop: palette.top,
        skyBottom: palette.bottom,
        cloudLayers: threeLayers(isNight ? "#6a7690" : "#e4e8ee", isNight ? "#1c2230" : "#8b96a6", 1, isNight),
        hazeOpacity: 0.07,
        sunVisible: isSunVisible(sky, input.dayPhase),
        moonVisible: isMoonVisible(sky, input.dayPhase),
        starDots: "none",
        cloudDensityScore: 0.8,
      };
    }

    case "fog": {
      const palette = SKY_PALETTES.fog[isNight ? "night" : "day"];
      return {
        ...NEUTRAL_PROFILE,
        id: "fog",
        skyTop: palette.top,
        skyBottom: palette.bottom,
        cloudLayers: [],
        hazeOpacity: isNight ? 0.5 : 0.58,
        fogBandCount: 4,
        sunVisible: isSunVisible(sky, input.dayPhase),
        moonVisible: isMoonVisible(sky, input.dayPhase),
        cloudDensityScore: 0.35,
      };
    }

    case "drizzle":
    case "rain":
    case "heavy-rain": {
      const tier = condition === "drizzle" ? "drizzle" : intensity === "heavy" ? "heavy-rain" : intensity === "light" ? "light-rain" : "moderate-rain";
      const day = PRECIP_DAY_PALETTE[tier];
      const top = isNight ? nightVariant(day.top, 0.55) : day.top;
      const bottom = isNight ? nightVariant(day.bottom, 0.55) : day.bottom;
      const densityScale = tier === "drizzle" ? 0.55 : tier === "light-rain" ? 0.7 : tier === "moderate-rain" ? 0.9 : 1.15;
      const rainProfiles: Record<string, PrecipitationVisual> = {
        drizzle: precip("rain", 0.2, [4, 7], [3, 4.5], [0.1, 0.22], 0.08, false),
        "light-rain": precip("rain", 0.4, [8, 13], [5, 7], [0.18, 0.32], 0.11, false),
        "moderate-rain": precip("rain", 0.65, [12, 19], [7, 10], [0.28, 0.44], 0.17, false),
        "heavy-rain": precip("rain", 1, [18, 30], [10, 14.5], [0.4, 0.6], 0.27, false),
      };
      return {
        ...NEUTRAL_PROFILE,
        id: tier,
        skyTop: top,
        skyBottom: bottom,
        cloudLayers: threeLayers(isNight ? "#5c6d86" : "#c3ccd8", isNight ? "#141a28" : "#485a72", densityScale, isNight),
        precipitation: rainProfiles[tier],
        hazeOpacity: rainProfiles[tier].hazeOpacity,
        sunVisible: isSunVisible(sky, input.dayPhase),
        moonVisible: isMoonVisible(sky, input.dayPhase),
        cloudDensityScore: clamp01(0.55 + densityScale * 0.2),
      };
    }

    case "freezing-rain": {
      const tier = intensity === "light" ? "freezing-drizzle" : "freezing-rain";
      const day = PRECIP_DAY_PALETTE[tier];
      const top = isNight ? nightVariant(day.top, 0.55) : day.top;
      const bottom = isNight ? nightVariant(day.bottom, 0.55) : day.bottom;
      const freezingProfiles: Record<string, PrecipitationVisual> = {
        "freezing-drizzle": precip("rain", 0.25, [5, 8], [3.5, 5], [0.14, 0.26], 0.14, true),
        "freezing-rain": precip("rain", 0.5, [10, 16], [6, 8.5], [0.24, 0.4], 0.2, true),
      };
      return {
        ...NEUTRAL_PROFILE,
        id: tier,
        skyTop: top,
        skyBottom: bottom,
        cloudLayers: threeLayers(isNight ? "#59738a" : "#c7d6de", isNight ? "#14232c" : "#3f5c6c", 0.85, isNight),
        precipitation: freezingProfiles[tier],
        hazeOpacity: freezingProfiles[tier].hazeOpacity,
        sunVisible: isSunVisible(sky, input.dayPhase),
        moonVisible: isMoonVisible(sky, input.dayPhase),
        cloudDensityScore: 0.72,
      };
    }

    case "snow":
    case "heavy-snow": {
      const isShower = sky === "partly-cloudy";
      const tier = isShower ? "snow-showers" : condition === "heavy-snow" ? "heavy-snow" : intensity === "moderate" ? "moderate-snow" : "light-snow";
      const day = PRECIP_DAY_PALETTE[tier];
      const top = isNight ? nightVariant(day.top, 0.55) : day.top;
      const bottom = isNight ? nightVariant(day.bottom, 0.55) : day.bottom;
      // Bumped a full tier up from the first pass — "light snow" must
      // read as unmistakably snowing, never "maybe two flakes if you
      // squint," while still staying visibly the gentlest of the three.
      const snowProfiles: Record<string, PrecipitationVisual> = {
        "light-snow": precip("snow", 0.42, [2.4, 3.7], [0.45, 0.78], [0.5, 0.74], 0.09, false),
        "snow-showers": precip("snow", 0.56, [2.8, 4.2], [0.6, 0.95], [0.58, 0.78], 0.13, false),
        "moderate-snow": precip("snow", 0.75, [3.2, 4.9], [0.68, 1.1], [0.64, 0.84], 0.19, false),
        "heavy-snow": precip("snow", 1, [3.9, 6.2], [0.88, 1.4], [0.74, 0.97], 0.34, false),
      };
      const densityScale = isShower ? 0.75 : tier === "heavy-snow" ? 1.25 : tier === "moderate-snow" ? 0.95 : 0.68;
      return {
        ...NEUTRAL_PROFILE,
        id: tier,
        skyTop: top,
        skyBottom: bottom,
        cloudLayers: isShower ? twoLayers(isNight ? "#9aacc6" : "#ffffff", isNight ? "#3a4a68" : "#c9d5e2", isNight) : threeLayers(isNight ? "#8090a8" : "#eef1f5", isNight ? "#28334a" : "#a3b0c0", densityScale, isNight),
        precipitation: snowProfiles[tier],
        hazeOpacity: snowProfiles[tier].hazeOpacity,
        sunVisible: isSunVisible(sky, input.dayPhase),
        moonVisible: isMoonVisible(sky, input.dayPhase),
        cloudDensityScore: isShower ? 0.5 : clamp01(0.6 + densityScale * 0.2),
      };
    }

    case "mixed-precipitation": {
      const day = PRECIP_DAY_PALETTE["moderate-snow"];
      const top = isNight ? nightVariant(day.top, 0.55) : day.top;
      const bottom = isNight ? nightVariant(day.bottom, 0.55) : day.bottom;
      return {
        ...NEUTRAL_PROFILE,
        id: "mixed-precipitation",
        skyTop: top,
        skyBottom: bottom,
        cloudLayers: threeLayers(isNight ? "#7a8ca6" : "#dde3ea", isNight ? "#242e44" : "#94a2b4", 0.9, isNight),
        precipitation: precip("snow", 0.55, [2.6, 4], [0.6, 1], [0.42, 0.65], 0.16, true),
        hazeOpacity: 0.16,
        sunVisible: isSunVisible(sky, input.dayPhase),
        moonVisible: isMoonVisible(sky, input.dayPhase),
        cloudDensityScore: 0.78,
      };
    }

    case "thunderstorm": {
      const day = PRECIP_DAY_PALETTE.storm;
      const top = isNight ? nightVariant(day.top, 0.4) : day.top;
      const bottom = isNight ? nightVariant(day.bottom, 0.4) : day.bottom;
      const hasRain = precipitationType === "rain";
      const rainHeavy = hasRain && intensity === "heavy";
      const stormRainProfile: PrecipitationVisual | null = !hasRain
        ? null
        : rainHeavy
          ? precip("rain", 1, [20, 32], [11, 15], [0.42, 0.62], 0.3, false)
          : precip("rain", 0.4, [8, 13], [5, 7], [0.18, 0.32], 0.14, false);
      return {
        ...NEUTRAL_PROFILE,
        id: !hasRain ? "storm-dry" : rainHeavy ? "storm-heavy-rain" : "storm-light-rain",
        skyTop: top,
        skyBottom: bottom,
        cloudLayers: threeLayers("#4a4368", "#0c0a16", 1.25, isNight),
        precipitation: stormRainProfile,
        hazeOpacity: stormRainProfile ? stormRainProfile.hazeOpacity : 0.1,
        sunVisible: isSunVisible(sky, input.dayPhase),
        moonVisible: isMoonVisible(sky, input.dayPhase),
        lightning,
        cloudDensityScore: 1,
      };
    }

    case "unknown":
    default:
      return NEUTRAL_PROFILE;
  }
}
