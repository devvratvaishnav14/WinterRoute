/**
 * Presentation-only scene descriptor for the results-page weather
 * background. Deliberately NOT part of `lib/scoring/`'s `CommuteFeatureSet`
 * or any other analytical type — nothing here feeds the risk index,
 * duration model, or timing recommendation. See
 * `resolveWeatherScene.ts` for how it's derived, and
 * docs/decisions/0012-route-map-and-weather-scene.md for the full
 * rationale.
 */

export type WeatherSceneCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy-rain"
  | "freezing-rain"
  | "snow"
  | "heavy-snow"
  | "mixed-precipitation"
  | "thunderstorm"
  | "unknown";

export type WeatherSceneIntensity = "light" | "moderate" | "heavy";

export type WeatherSceneDayPhase = "day" | "night";

export type WeatherScenePrecipitationType = "none" | "rain" | "snow" | "freezing" | "mixed";

export type WeatherSceneCloudiness = "clear" | "partly-cloudy" | "overcast";

export type WeatherSceneWindLevel = "calm" | "breezy" | "windy";

/**
 * A finer-grained, purely presentational sky dimension than `cloudiness`
 * (which collapses fog into "overcast") — the compositional axis the
 * renderer's sun-visibility rule and the Weather Scene Lab key off,
 * independent of whether precipitation is also happening. Precipitation/
 * storm conditions always resolve to `"overcast"` here (this app never
 * renders a "sun shower"); `"foggy"` is its own value, never folded into
 * `"overcast"`.
 */
export type WeatherSceneSky = "clear" | "mainly-clear" | "partly-cloudy" | "overcast" | "foggy";

/**
 * `"unavailable"` is the honest default when weather data failed or is
 * empty — the scene renderer must treat this as "show a neutral
 * atmosphere," never assume `"clear"`.
 */
export type WeatherSceneDataStatus = "resolved" | "unavailable";

export interface WeatherSceneDescriptor {
  condition: WeatherSceneCondition;
  intensity: WeatherSceneIntensity;
  dayPhase: WeatherSceneDayPhase;
  precipitationType: WeatherScenePrecipitationType;
  cloudiness: WeatherSceneCloudiness;
  windLevel: WeatherSceneWindLevel;
  /** See `WeatherSceneSky` — independent of `precipitationType`/`lightning`, so the renderer never has to re-derive "is there a visible sky behind this" from the flat `condition`. */
  sky: WeatherSceneSky;
  /**
   * True whenever thunderstorm activity is indicated, INDEPENDENT of
   * whether `precipitationType` is `"none"` — this is what makes a "dry
   * thunderstorm" (lightning, no rain particles) representable, rather
   * than `condition === "thunderstorm"` always implying rain.
   */
  lightning: boolean;
  /** The commute's own selected date/time — never the viewer's current clock time. */
  selectedTripTime: Date;
  dataStatus: WeatherSceneDataStatus;
  /** Plain-language notes on how the scene was derived (model agreement, alert influence, fallbacks used) — for the dev-diagnostic view, never shown as the main user-facing text. */
  derivationNotes: string[];
}
