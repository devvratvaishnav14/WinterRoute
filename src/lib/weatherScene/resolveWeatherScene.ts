import type { RouteWeatherAnalysis, WeatherForecastPoint } from "@/lib/weather/types";
import { computeDayPhase } from "./dayPhase";
import type {
  WeatherSceneCloudiness,
  WeatherSceneCondition,
  WeatherSceneDescriptor,
  WeatherSceneIntensity,
  WeatherScenePrecipitationType,
  WeatherSceneSky,
  WeatherSceneWindLevel,
} from "./types";

/**
 * WMO weather-interpretation code -> visual scene bucket. Same code set
 * as `lib/weather/weatherCodes.ts` (verified against Open-Meteo's
 * published WMO table) — kept as its own mapping here (rather than
 * reusing that file's human-readable descriptions) because the scene
 * needs a coarser, visually-meaningful bucket, not a sentence.
 */
const CODE_TO_CONDITION: Record<number, WeatherSceneCondition> = {
  0: "clear",
  1: "clear",
  2: "partly-cloudy",
  3: "cloudy",
  45: "fog",
  48: "fog",
  51: "drizzle",
  53: "drizzle",
  55: "drizzle",
  56: "freezing-rain",
  57: "freezing-rain",
  61: "rain",
  63: "rain",
  65: "heavy-rain",
  66: "freezing-rain",
  67: "freezing-rain",
  71: "snow",
  73: "snow",
  75: "heavy-snow",
  77: "snow",
  80: "rain",
  81: "rain",
  82: "heavy-rain",
  85: "snow",
  86: "heavy-snow",
  95: "thunderstorm",
  96: "thunderstorm",
  99: "thunderstorm",
};

/** Rough ordinal "how much does this affect the atmosphere" scale — used only to pick one MODEL's own worst-case condition across the route, never to compare across different models. */
const SEVERITY_ORDER: WeatherSceneCondition[] = [
  "clear",
  "partly-cloudy",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "freezing-rain",
  "snow",
  "heavy-rain",
  "heavy-snow",
  "thunderstorm",
];

/** The "no real precipitation" sky-only buckets — used to pick a sensible middle-ground consensus when models disagree without any of them showing precipitation. */
const SKY_ONLY_CONDITIONS: WeatherSceneCondition[] = ["clear", "partly-cloudy", "cloudy"];

function conditionSeverity(condition: WeatherSceneCondition): number {
  const index = SEVERITY_ORDER.indexOf(condition);
  return index === -1 ? 0 : index;
}

/**
 * Each independent model's OWN worst-case (most severe) condition
 * anywhere along the route — one vote per model, regardless of how many
 * sample points that model appears at. This is what makes "route
 * exposure" and "model agreement" additive rather than one model with
 * more sample points silently outvoting the others.
 */
function perModelWorstCaseConditions(forecasts: WeatherForecastPoint[]): Map<string, WeatherSceneCondition> {
  const worstByModel = new Map<string, WeatherSceneCondition>();

  for (const forecast of forecasts) {
    if (forecast.weatherCode === undefined) continue;
    const condition = CODE_TO_CONDITION[forecast.weatherCode];
    if (!condition) continue;

    const modelId = forecast.source.modelId;
    const current = worstByModel.get(modelId);
    if (!current || conditionSeverity(condition) > conditionSeverity(current)) {
      worstByModel.set(modelId, condition);
    }
  }

  return worstByModel;
}

function resolveConsensusCondition(votes: WeatherSceneCondition[]): { condition: WeatherSceneCondition; notes: string[] } {
  if (votes.length === 0) return { condition: "unknown", notes: ["No model reported a usable weather code."] };

  const counts = new Map<WeatherSceneCondition, number>();
  for (const vote of votes) counts.set(vote, (counts.get(vote) ?? 0) + 1);

  let topCondition: WeatherSceneCondition = votes[0];
  let topCount = 0;
  for (const [condition, count] of counts) {
    if (count > topCount) {
      topCondition = condition;
      topCount = count;
    }
  }

  if (topCount / votes.length >= 0.5) {
    return {
      condition: topCondition,
      notes: [`${topCount}/${votes.length} model${votes.length === 1 ? "" : "s"} agree on "${topCondition}".`],
    };
  }

  // No majority — genuine disagreement. Never let a minority signal (even a
  // severe one) dictate the whole-page atmosphere; fall back to a
  // defensible neutral consensus instead.
  if (votes.every((v) => SKY_ONLY_CONDITIONS.includes(v))) {
    const middle = [...votes].sort((a, b) => conditionSeverity(a) - conditionSeverity(b))[Math.floor(votes.length / 2)];
    return { condition: middle, notes: [`Models disagreed on sky cover (${votes.join(", ")}) — used the middle consensus "${middle}".`] };
  }

  const skyVotes = votes.filter((v) => SKY_ONLY_CONDITIONS.includes(v));
  if (skyVotes.length > 0) {
    const fallback = skyVotes.includes("cloudy") ? "cloudy" : skyVotes[0];
    return {
      condition: fallback,
      notes: [`Models disagreed (${votes.join(", ")}), with no majority — used "${fallback}" rather than the minority precipitation signal.`],
    };
  }

  // Every vote was some precipitation type, but none reached a majority.
  return { condition: "mixed-precipitation", notes: [`Models disagreed on precipitation type (${votes.join(", ")}) with no majority — treated as mixed precipitation.`] };
}

function intensityFor(condition: WeatherSceneCondition): WeatherSceneIntensity {
  if (condition === "heavy-rain" || condition === "heavy-snow" || condition === "thunderstorm") return "heavy";
  if (condition === "drizzle" || condition === "fog" || condition === "clear" || condition === "partly-cloudy") return "light";
  return "moderate";
}

function cloudinessFor(condition: WeatherSceneCondition): WeatherSceneCloudiness {
  if (condition === "clear") return "clear";
  if (condition === "partly-cloudy") return "partly-cloudy";
  return "overcast";
}

function precipitationTypeFor(condition: WeatherSceneCondition, maxPrecipitationMm: number, maxSnowfallCm: number): WeatherScenePrecipitationType {
  switch (condition) {
    case "rain":
    case "heavy-rain":
    case "drizzle":
      return "rain";
    case "thunderstorm":
      // Thunderstorm activity does NOT imply rain — a genuine "dry
      // thunderstorm" (lightning, no measurable precipitation) must stay
      // representable, so precipitation here reflects the actual measured
      // amount rather than being hardcoded.
      if (maxPrecipitationMm > 0) return "rain";
      if (maxSnowfallCm > 0) return "snow";
      return "none";
    case "snow":
    case "heavy-snow":
      return "snow";
    case "freezing-rain":
      return "freezing";
    case "mixed-precipitation":
      return "mixed";
    default:
      return "none";
  }
}

/**
 * The compositional sky dimension — independent of precipitation/
 * lightning. Any precipitation-bearing or stormy condition always reads
 * as `"overcast"` (this app never renders a "sun shower"); fog is its
 * own value, never folded into "overcast". `"mainly-clear"` (WMO code 1)
 * is distinguished from `"clear"` (WMO code 0) by checking whether any
 * contributing forecast actually reported code 1 — a light touch, since
 * both currently share the same `"clear"` `condition` bucket.
 */
function skyFor(condition: WeatherSceneCondition, forecasts: WeatherForecastPoint[]): WeatherSceneSky {
  if (condition === "fog") return "foggy";
  if (condition === "partly-cloudy") return "partly-cloudy";
  if (condition === "clear") {
    return forecasts.some((f) => f.weatherCode === 1) ? "mainly-clear" : "clear";
  }
  if (condition === "cloudy") return "overcast";
  // Every precipitation/storm/mixed/unknown condition: overcast backdrop.
  return "overcast";
}

function windLevelFor(maxWindSpeedKmh: number | undefined): WeatherSceneWindLevel {
  if (maxWindSpeedKmh === undefined) return "calm";
  if (maxWindSpeedKmh >= 40) return "windy";
  if (maxWindSpeedKmh >= 20) return "breezy";
  return "calm";
}

const SNOW_ALERT_KEYWORDS = /snow|winter storm|blizzard/i;
const RAIN_ALERT_KEYWORDS = /rain|flood/i;

/**
 * Resolves ONE dominant background scene for the whole route from the
 * existing multi-model `RouteWeatherAnalysis` — never the first model's
 * code alone, never today's/current weather, only what the selected
 * commute's own analysis already contains. Purely presentational: does
 * not read or write anything from `lib/scoring/`.
 */
export function resolveWeatherScene(
  analysis: RouteWeatherAnalysis | null,
  originForDayPhase: { latitude: number; longitude: number },
): WeatherSceneDescriptor {
  const selectedTripTime = analysis?.tripDateTime ?? new Date();
  const dayPhase = computeDayPhase(originForDayPhase.latitude, originForDayPhase.longitude, selectedTripTime);

  if (!analysis || analysis.samples.length === 0) {
    return {
      condition: "unknown",
      intensity: "light",
      dayPhase,
      precipitationType: "none",
      cloudiness: "partly-cloudy",
      windLevel: "calm",
      sky: "clear",
      lightning: false,
      selectedTripTime,
      dataStatus: "unavailable",
      derivationNotes: ["No weather analysis available for this trip — showing a neutral atmosphere."],
    };
  }

  const forecasts = analysis.samples.flatMap((s) => s.forecasts);
  if (forecasts.length === 0) {
    return {
      condition: "unknown",
      intensity: "light",
      dayPhase,
      precipitationType: "none",
      cloudiness: "partly-cloudy",
      windLevel: "calm",
      sky: "clear",
      lightning: false,
      selectedTripTime,
      dataStatus: "unavailable",
      derivationNotes: ["No model returned usable data for this trip — showing a neutral atmosphere."],
    };
  }

  const worstByModel = perModelWorstCaseConditions(forecasts);
  const { condition: votedCondition, notes } = resolveConsensusCondition([...worstByModel.values()]);

  const maxPrecipitationMm = Math.max(0, ...forecasts.map((f) => f.precipitationMm ?? 0));
  const maxSnowfallCm = Math.max(0, ...forecasts.map((f) => f.snowfallCm ?? 0));
  const maxWindSpeedKmh = forecasts.some((f) => f.windSpeedKmh !== undefined)
    ? Math.max(...forecasts.map((f) => f.windSpeedKmh ?? 0))
    : undefined;

  let condition = votedCondition;
  const derivationNotes = [...notes];

  // A minority vote for a precipitation bucket, with no measurable
  // precipitation to back it up, is exactly the "one model's tiny
  // drizzle signal" case — don't let it read as anything other than the
  // sky-cover consensus already chosen above.
  if (condition !== "unknown" && precipitationTypeFor(condition, maxPrecipitationMm, maxSnowfallCm) !== "none" && maxPrecipitationMm <= 0 && maxSnowfallCm <= 0) {
    derivationNotes.push(`"${condition}" had no measurable precipitation/snowfall backing it — treated as cloudy instead.`);
    condition = "cloudy";
  }

  // Official alert evidence can reasonably intensify (never invent) an
  // already-supported condition — never override a "no precipitation"
  // consensus into fabricated weather.
  if (analysis.alertStatus === "unavailable") {
    derivationNotes.push("Official alerts could not be checked for this trip.");
  } else if (analysis.alerts.length > 0) {
    const hasSnowAlert = analysis.alerts.some((a) => SNOW_ALERT_KEYWORDS.test(a.title));
    const hasRainAlert = analysis.alerts.some((a) => RAIN_ALERT_KEYWORDS.test(a.title));
    if (hasSnowAlert && (condition === "snow" || maxSnowfallCm > 0)) {
      derivationNotes.push("An official snow-related alert supports escalating to heavy snow.");
      condition = "heavy-snow";
    } else if (hasRainAlert && (condition === "rain" || maxPrecipitationMm > 0)) {
      derivationNotes.push("An official rain-related alert supports escalating to heavy rain.");
      condition = "heavy-rain";
    }
  }

  return {
    condition,
    intensity: intensityFor(condition),
    dayPhase,
    precipitationType: precipitationTypeFor(condition, maxPrecipitationMm, maxSnowfallCm),
    cloudiness: cloudinessFor(condition),
    windLevel: windLevelFor(maxWindSpeedKmh),
    sky: skyFor(condition, forecasts),
    lightning: condition === "thunderstorm",
    selectedTripTime,
    dataStatus: "resolved",
    derivationNotes,
  };
}
