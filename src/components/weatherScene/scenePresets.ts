import type { DevSceneOverride } from "@/lib/weatherScene/devSceneOverride";

/**
 * The named Weather Scene Lab presets — pure data, no rendering. Each
 * preset is a FULL compositional tuple (not just `condition`+`dayPhase`)
 * because several presets need a precipitation intensity/type that
 * `resolveWeatherScene` would never derive from `condition` alone in a
 * real forecast — e.g. "Thunderstorm + Light Rain" needs
 * `intensity: "light"` even though a real thunderstorm always derives
 * `"heavy"`, and "Thunderstorm" (dry) needs `precipitationType: "none"`
 * with `lightning: true`. See `docs/architecture.md` "Weather Scene Lab".
 */
export const SCENE_PRESETS: DevSceneOverride[] = [
  { label: "Clear Day", condition: "clear", dayPhase: "day", sky: "clear", precipitationType: "none", intensity: "light", lightning: false },
  { label: "Clear Night", condition: "clear", dayPhase: "night", sky: "clear", precipitationType: "none", intensity: "light", lightning: false },
  { label: "Mainly Clear Day", condition: "clear", dayPhase: "day", sky: "mainly-clear", precipitationType: "none", intensity: "light", lightning: false },
  { label: "Partly Cloudy Day", condition: "partly-cloudy", dayPhase: "day", sky: "partly-cloudy", precipitationType: "none", intensity: "light", lightning: false },
  { label: "Partly Cloudy Night", condition: "partly-cloudy", dayPhase: "night", sky: "partly-cloudy", precipitationType: "none", intensity: "light", lightning: false },
  { label: "Overcast Day", condition: "cloudy", dayPhase: "day", sky: "overcast", precipitationType: "none", intensity: "moderate", lightning: false },
  { label: "Overcast Night", condition: "cloudy", dayPhase: "night", sky: "overcast", precipitationType: "none", intensity: "moderate", lightning: false },
  { label: "Fog", condition: "fog", dayPhase: "day", sky: "foggy", precipitationType: "none", intensity: "light", lightning: false },
  { label: "Light Drizzle", condition: "drizzle", dayPhase: "day", sky: "overcast", precipitationType: "rain", intensity: "light", lightning: false },
  { label: "Light Rain", condition: "rain", dayPhase: "day", sky: "overcast", precipitationType: "rain", intensity: "light", lightning: false },
  { label: "Moderate Rain", condition: "rain", dayPhase: "day", sky: "overcast", precipitationType: "rain", intensity: "moderate", lightning: false },
  { label: "Heavy Rain", condition: "heavy-rain", dayPhase: "day", sky: "overcast", precipitationType: "rain", intensity: "heavy", lightning: false },
  { label: "Freezing Drizzle", condition: "freezing-rain", dayPhase: "day", sky: "overcast", precipitationType: "freezing", intensity: "light", lightning: false },
  { label: "Freezing Rain", condition: "freezing-rain", dayPhase: "day", sky: "overcast", precipitationType: "freezing", intensity: "moderate", lightning: false },
  { label: "Light Snow", condition: "snow", dayPhase: "day", sky: "overcast", precipitationType: "snow", intensity: "light", lightning: false },
  { label: "Moderate Snow", condition: "snow", dayPhase: "day", sky: "overcast", precipitationType: "snow", intensity: "moderate", lightning: false },
  { label: "Heavy Snow", condition: "heavy-snow", dayPhase: "day", sky: "overcast", precipitationType: "snow", intensity: "heavy", lightning: false },
  { label: "Snow Showers", condition: "snow", dayPhase: "day", sky: "partly-cloudy", precipitationType: "snow", intensity: "moderate", lightning: false },
  { label: "Thunderstorm", condition: "thunderstorm", dayPhase: "day", sky: "overcast", precipitationType: "none", intensity: "heavy", lightning: true },
  { label: "Thunderstorm + Light Rain", condition: "thunderstorm", dayPhase: "day", sky: "overcast", precipitationType: "rain", intensity: "light", lightning: true },
  { label: "Thunderstorm + Heavy Rain", condition: "thunderstorm", dayPhase: "day", sky: "overcast", precipitationType: "rain", intensity: "heavy", lightning: true },
];
