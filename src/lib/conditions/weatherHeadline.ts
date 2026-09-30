import type { Route } from "@/lib/route/types";
import type { RouteWeatherAnalysis, WeatherForecastPoint } from "@/lib/weather/types";
import { resolveWeatherScene } from "@/lib/weatherScene/resolveWeatherScene";
import type { WeatherSceneCondition } from "@/lib/weatherScene/types";

/**
 * Turns the existing multi-model, multi-sample `RouteWeatherAnalysis`
 * into a short, prominent TITLE ("Light Rain Possible") plus ONE
 * natural, full SENTENCE ("One forecast model predicts light rain
 * across much of your route.") — deliberately kept as two separate
 * fields so a UI never has to concatenate "what may happen" and "where/
 * how confidently" into one run-on phrase (see
 * docs/architecture.md "Weather headline derivation"). Model agreement
 * and route coverage stay SECONDARY, supporting information — folded
 * into the sentence's grammar, never the title itself. Presentation-
 * only: nothing here is read by `lib/scoring/`, and none of these
 * buckets are a new analytical severity score.
 */

export type WeatherIntensity = "none" | "light" | "moderate" | "heavy";
export type WeatherAgreement = "none" | "low" | "medium" | "high";
export type RouteCoverage = "none" | "isolated" | "part" | "much" | "most-all";

export interface WeatherConditionPresentation {
  primaryCondition: "rain" | "snow" | "clear" | "partly-cloudy" | "cloudy" | "fog" | "none";
  intensity: WeatherIntensity;
  agreement: WeatherAgreement;
  affectedRouteShare: RouteCoverage;
  /** Short and prominent — e.g. "Light Rain Possible", "Heavy Snow Expected", "Clear". Never repeats the generic noun alone ("Rain") followed by a sentence that just restates it. */
  title: string;
  /** One natural, full sentence a normal user can read at a glance — never the technical "measurable rain" phrasing, never a bare "N of M models" fragment. */
  sentence: string;
}

/**
 * PRESENTATIONAL intensity thresholds only — loosely following standard
 * hourly precipitation/snowfall-rate conventions (e.g. Environment
 * Canada's public intensity language), never a new analytical severity
 * score, and never read by `lib/scoring/`'s `WeatherSeverityScore`.
 */
const PRECIPITATION_INTENSITY_THRESHOLDS_MM = { light: 2.5, moderate: 7.5 };
const SNOWFALL_INTENSITY_THRESHOLDS_CM = { light: 1, moderate: 2.5 };

/** A gust this strong (km/h) is promoted from ordinary supporting data into its own prominent route condition. */
const STRONG_WIND_GUST_THRESHOLD_KMH = 50;

function intensityFromAmount(amountMm: number, thresholds: { light: number; moderate: number }): WeatherIntensity {
  if (amountMm <= 0) return "none";
  if (amountMm < thresholds.light) return "light";
  if (amountMm < thresholds.moderate) return "moderate";
  return "heavy";
}

function agreementFromCounts(predicting: number, withData: number): WeatherAgreement {
  if (withData === 0 || predicting === 0) return "none";
  const ratio = predicting / withData;
  if (ratio >= 1) return "high";
  if (ratio >= 0.5) return "medium";
  return "low";
}

/** Route-coverage buckets — centralized here so "isolated" vs. "most of the route" is never decided ad hoc in JSX. Based on the SHARE of actual weather sample points along the route showing measurable precipitation, not just whether any model anywhere predicted it. Thresholds unchanged from the previous stage — only the wording below changed. */
const COVERAGE_THRESHOLDS = { isolated: 0.25, part: 0.6, much: 0.85 };

function coverageFromShare(share: number): RouteCoverage {
  if (share <= 0) return "none";
  if (share <= COVERAGE_THRESHOLDS.isolated) return "isolated";
  if (share <= COVERAGE_THRESHOLDS.part) return "part";
  if (share <= COVERAGE_THRESHOLDS.much) return "much";
  return "most-all";
}

function maxAmount(forecasts: WeatherForecastPoint[], selector: (f: WeatherForecastPoint) => number | undefined): number {
  const values = forecasts.map(selector).filter((v): v is number => v !== undefined);
  return values.length > 0 ? Math.max(...values) : 0;
}

/** The share of real sample points along the route where at least one model detected measurable precipitation/snowfall at THAT point — never "across the route" from a single affected sample. */
function routeShareAffected(analysis: RouteWeatherAnalysis, selector: (f: WeatherForecastPoint) => number | undefined): number {
  if (analysis.samples.length === 0) return 0;
  const affected = analysis.samples.filter((sample) => sample.forecasts.some((f) => (selector(f) ?? 0) > 0)).length;
  return affected / analysis.samples.length;
}

/** "WHERE" — kept separate from "WHAT MAY HAPPEN" (the title's job) so a sentence never mixes uncertainty about whether it rains with confidence about where. */
function coveragePhrase(coverage: RouteCoverage): string {
  switch (coverage) {
    case "isolated":
      return "near a small part of your route";
    case "part":
      return "along part of your route";
    case "much":
      return "across much of your route";
    case "most-all":
      return "across most of your route";
    case "none":
      return "";
  }
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function capitalizeWord(word: string): string {
  return word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
}

function agreementWord(agreement: WeatherAgreement): string {
  switch (agreement) {
    case "low":
      return "Possible";
    case "medium":
      return "Likely";
    case "high":
      return "Expected";
    case "none":
      return "";
  }
}

/**
 * Natural-language subject + matching verb for the supporting sentence
 * — "One forecast model predicts...", "Two of three forecast models
 * predict...", "All three forecast models predict...". Deliberately
 * avoids the flatter "1 of 3 forecast models" phrasing in full
 * sentences (that form is fine for compact secondary metadata, just
 * not for a sentence meant to read naturally).
 */
function modelSubjectAndVerb(predicting: number, withData: number, agreement: WeatherAgreement): { subject: string; verb: string } {
  if (agreement === "high") {
    if (withData === 1) return { subject: "The forecast model", verb: "predicts" };
    return { subject: `All ${numberWord(withData)} forecast models`, verb: "predict" };
  }
  if (agreement === "medium") {
    const subject = `${capitalizeWord(numberWord(predicting))} of ${numberWord(withData)} forecast models`;
    return { subject, verb: predicting === 1 ? "predicts" : "predict" };
  }
  // low
  if (predicting === 1) return { subject: "One forecast model", verb: "predicts" };
  return { subject: `${capitalizeWord(numberWord(predicting))} forecast models`, verb: "predict" };
}

function precipitationTitle(noun: "rain" | "snow", intensity: WeatherIntensity, agreement: WeatherAgreement): string {
  if (intensity === "none") return `No ${capitalizeWord(noun)} Expected`;
  return `${capitalizeWord(intensity)} ${capitalizeWord(noun)} ${agreementWord(agreement)}`;
}

function precipitationSentence(
  noun: "rain" | "snow",
  intensity: WeatherIntensity,
  agreement: WeatherAgreement,
  coverage: RouteCoverage,
  predicting: number,
  withData: number,
): string {
  if (intensity === "none") return `No ${noun} is currently expected on this route.`;
  const { subject, verb } = modelSubjectAndVerb(predicting, withData, agreement);
  return `${subject} ${verb} ${intensity} ${noun} ${coveragePhrase(coverage)}.`;
}

function buildPrecipitationPresentation(
  noun: "rain" | "snow",
  analysis: RouteWeatherAnalysis,
  forecasts: WeatherForecastPoint[],
  amountSelector: (f: WeatherForecastPoint) => number | undefined,
  thresholds: { light: number; moderate: number },
): WeatherConditionPresentation {
  const amount = maxAmount(forecasts, amountSelector);
  const intensity = intensityFromAmount(amount, thresholds);

  const modelsWithData = new Set(forecasts.map((f) => f.source.displayName)).size;
  const modelsPredicting = new Set(forecasts.filter((f) => (amountSelector(f) ?? 0) > 0).map((f) => f.source.displayName)).size;
  const agreement = agreementFromCounts(modelsPredicting, modelsWithData);

  const share = routeShareAffected(analysis, amountSelector);
  const coverage = intensity === "none" ? "none" : coverageFromShare(share);

  return {
    primaryCondition: noun,
    intensity,
    agreement,
    affectedRouteShare: coverage,
    title: precipitationTitle(noun, intensity, agreement),
    sentence: precipitationSentence(noun, intensity, agreement, coverage, modelsPredicting, modelsWithData),
  };
}

const SKY_CONDITION_COPY: Partial<Record<WeatherSceneCondition, { title: string; sentence: string }>> = {
  clear: { title: "Clear", sentence: "Clear conditions are expected along the route." },
  "partly-cloudy": { title: "Partly Cloudy", sentence: "Partly cloudy conditions are expected during your commute." },
  cloudy: { title: "Cloudy", sentence: "Cloudy conditions are expected along most of the route." },
  fog: { title: "Fog", sentence: "Fog is expected along part of the route." },
};

function skyConditionPresentation(condition: WeatherSceneCondition): WeatherConditionPresentation {
  const mapped: WeatherConditionPresentation["primaryCondition"] =
    condition === "clear" || condition === "partly-cloudy" || condition === "cloudy" || condition === "fog" ? condition : "none";
  const copy = SKY_CONDITION_COPY[condition];
  return {
    primaryCondition: mapped,
    intensity: "none",
    agreement: "none",
    affectedRouteShare: "none",
    title: copy?.title ?? "",
    sentence: copy?.sentence ?? "",
  };
}

/**
 * The headline rain/snow answer, PLUS the ordinary sky-condition
 * headline (clear/partly-cloudy/cloudy/fog) for when there's no real
 * precipitation. Callers typically show `rain`/`snow` (whichever, if
 * either, has real intensity) as the prominent row and `sky` as the
 * fallback prominent row when neither does.
 */
export interface RouteWeatherHeadlines {
  rain: WeatherConditionPresentation;
  snow: WeatherConditionPresentation;
  sky: WeatherConditionPresentation;
  /** Only present when actual data supports promoting wind into its own prominent condition (see `STRONG_WIND_GUST_THRESHOLD_KMH`). */
  strongWind?: { title: string; sentence: string };
}

export function buildWeatherHeadlines(analysis: RouteWeatherAnalysis, route: Route): RouteWeatherHeadlines | null {
  if (analysis.samples.length === 0) return null;
  const forecasts = analysis.samples.flatMap((s) => s.forecasts);
  if (forecasts.length === 0) return null;

  const rain = buildPrecipitationPresentation("rain", analysis, forecasts, (f) => f.precipitationMm, PRECIPITATION_INTENSITY_THRESHOLDS_MM);
  const snow = buildPrecipitationPresentation("snow", analysis, forecasts, (f) => f.snowfallCm, SNOWFALL_INTENSITY_THRESHOLDS_CM);

  const scene = resolveWeatherScene(analysis, route.origin);
  const sky = skyConditionPresentation(scene.condition);

  const maxGust = maxAmount(forecasts, (f) => f.windGustsKmh ?? f.windSpeedKmh);
  const strongWind =
    maxGust >= STRONG_WIND_GUST_THRESHOLD_KMH
      ? { title: "Strong Wind", sentence: `Gusts up to ${Math.round(maxGust)} km/h are expected along your route.` }
      : undefined;

  return { rain, snow, sky, strongWind };
}
