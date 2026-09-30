import type { WeatherSceneDayPhase, WeatherScenePrecipitationType, WeatherSceneSky } from "./types";

export type WeatherIconKind = "sun" | "sun-cloud" | "cloud" | "rain-cloud" | "snow" | "storm-rain" | "storm" | "fog" | "moon" | "moon-cloud";

/**
 * Derives the icon kind from the SAME compositional fields the
 * background scene renders from (`sky`/`precipitationType`/`lightning`/
 * `dayPhase`) — never its own independent read of the weather, so the
 * icon can never disagree with the background (e.g. a sun icon over a
 * scene that's actually showing storm clouds). A sun/moon is only ever
 * chosen when `sunVisibility.ts` would also show one for that sky/day
 * combination — e.g. overcast never combines with a moon, since the
 * moon is never actually visible through thick cloud. Pure/presentation-
 * only, kept alongside `resolveWeatherScene.ts` rather than in
 * `components/` so `lib/conditions/` (also presentation-only, but a
 * `lib/` module) can depend on it without reaching into `components/`.
 */
export function deriveWeatherIconKind(
  sky: WeatherSceneSky,
  precipitationType: WeatherScenePrecipitationType,
  lightning: boolean,
  dayPhase: WeatherSceneDayPhase,
): WeatherIconKind {
  if (lightning) return precipitationType === "none" ? "storm" : "storm-rain";
  if (precipitationType === "snow" || precipitationType === "mixed") return "snow";
  if (precipitationType === "rain" || precipitationType === "freezing") return "rain-cloud";
  if (sky === "foggy") return "fog";
  if (sky === "overcast") return "cloud";
  if (sky === "partly-cloudy") return dayPhase === "night" ? "moon-cloud" : "sun-cloud";
  return dayPhase === "night" ? "moon" : "sun";
}
