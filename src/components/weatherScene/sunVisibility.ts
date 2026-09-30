import type { WeatherSceneDayPhase, WeatherSceneSky } from "@/lib/weatherScene/types";

/**
 * Deterministic sun/moon visibility — see docs/architecture.md "Sun
 * visibility rules". Because `resolveWeatherScene`'s `sky` dimension
 * already resolves to `"overcast"` whenever there's genuine
 * precipitation or a storm (this app never renders a sun-shower),
 * checking `sky` alone is sufficient here — no separate precipitation/
 * lightning check is needed:
 *
 * - clear / mainly-clear / partly-cloudy -> a celestial body is visible
 *   (sun by day, moon by night).
 * - overcast / foggy -> never visible, day or night.
 * - night -> the sun is never shown, regardless of sky.
 */
function celestialBodyVisible(sky: WeatherSceneSky): boolean {
  return sky === "clear" || sky === "mainly-clear" || sky === "partly-cloudy";
}

export function isSunVisible(sky: WeatherSceneSky, dayPhase: WeatherSceneDayPhase): boolean {
  return dayPhase === "day" && celestialBodyVisible(sky);
}

export function isMoonVisible(sky: WeatherSceneSky, dayPhase: WeatherSceneDayPhase): boolean {
  return dayPhase === "night" && celestialBodyVisible(sky);
}
