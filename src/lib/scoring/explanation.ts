import { FACTOR_LABELS } from "./overallRisk";
import { formatCount, pluralize } from "./pluralize";
import type { CommuteFeatureSet, FactorScore, RiskContribution, RiskFactorKey } from "./types";

/**
 * Deterministic, template-generated explanations — no LLM, no random
 * prose, per the project brief. Every sentence is built directly from
 * already-engineered feature values, and only for factors that are
 * actually `"scored"` (never a sentence about a `"not-applicable"` or
 * `"unavailable"` factor pretending to have something to say).
 */

function weatherSentence(features: CommuteFeatureSet, factor: FactorScore): string | undefined {
  if (factor.status !== "scored") return undefined;
  const w = features.weather;

  const notes: string[] = [];
  if (w.maxSnowfallCm && w.maxSnowfallCm > 0) {
    notes.push(`snow (up to ${w.maxSnowfallCm.toFixed(1)}cm forecast)`);
  }
  if (w.maxPrecipitationMm && w.maxPrecipitationMm > 0 && !notes.length) {
    const agreement =
      w.precipitationAgreementRatio !== undefined && w.modelsAvailable > 0
        ? ` (${Math.round(w.precipitationAgreementRatio * w.modelsAvailable)}/${w.modelsAvailable} models)`
        : "";
    notes.push(`precipitation${agreement}`);
  }
  if (w.notableWeatherExposureShare > 0 && (w.freezingRelatedAlert || features.segments.some((s) => s.weather.belowFreezingTemperature))) {
    notes.push("below-freezing conditions along part of the route");
  }
  if (w.relevantAlertCount > 0) {
    notes.push(`${w.relevantAlertCount} official ECCC ${pluralize(w.relevantAlertCount, "alert")} (${w.alertTypes.join(", ")})`);
  }

  if (notes.length === 0) {
    return "Weather conditions along the route show no notable precipitation, snow, or freezing risk.";
  }
  return `Weather evidence along the route includes ${notes.join(" and ")}.`;
}

function trafficSentence(features: CommuteFeatureSet, factor: FactorScore): string | undefined {
  if (factor.status !== "scored") return undefined;
  const t = features.traffic;
  const delay = t.trafficDelayMinutes ?? 0;

  if (delay <= 0) {
    return "Traffic-aware routing currently shows no significant delay compared with the reference duration.";
  }
  const jam = t.trafficJamRouteShare ? `, with ${Math.round(t.trafficJamRouteShare * 100)}% of the route in traffic-jam conditions` : "";
  return `Traffic-aware routing currently adds about ${formatCount(Math.round(delay), "minute")} compared with the reference duration${jam}.`;
}

function transitSentence(features: CommuteFeatureSet, factor: FactorScore): string | undefined {
  if (factor.status !== "scored") return undefined;
  const t = features.transit;

  if (t.canceledSegmentCount > 0) {
    const n = t.canceledSegmentCount;
    return `${n} matched transit ${pluralize(n, "segment")} on this route ${pluralize(n, "is", "are")} currently reported canceled.`;
  }
  if (t.relevantAlertEffects.length > 0) {
    return `A TransLink service alert (${t.relevantAlertEffects.join(", ")}) affects one or more transit segments.`;
  }
  if (t.skippedStopSegmentCount > 0) {
    const n = t.skippedStopSegmentCount;
    return `${n} transit ${pluralize(n, "segment")} currently ${pluralize(n, "reports", "report")} a skipped stop.`;
  }
  if (t.medianDelaySecondsAcrossRealtimeSegments) {
    return `Realtime data shows an observed delay of about ${formatCount(Math.round(t.medianDelaySecondsAcrossRealtimeSegments / 60), "minute")} on the transit portion of this route.`;
  }
  return "No relevant transit disruption is currently present.";
}

function roadEventSentence(features: CommuteFeatureSet, factor: FactorScore): string | undefined {
  if (factor.status !== "scored") return undefined;
  const r = features.roadEvents;

  if (r.relevantEventCount === 0) {
    return "No relevant road events were found near the route.";
  }
  const n = r.relevantEventCount;
  return `${n} relevant road ${pluralize(n, "event")} ${pluralize(n, "was", "were")} found near the route, the most severe rated "${r.highestSeverity ?? "unknown"}".`;
}

const SENTENCE_BUILDERS: Record<RiskFactorKey, (features: CommuteFeatureSet, factor: FactorScore) => string | undefined> = {
  weather: weatherSentence,
  traffic: trafficSentence,
  transit: transitSentence,
  roadEvents: roadEventSentence,
};

/** One deterministic sentence per applicable (`"scored"`) factor, ordered the same as `contributions` (highest weighted contribution first). */
export function buildExplanation(
  features: CommuteFeatureSet,
  factors: Record<RiskFactorKey, FactorScore>,
  contributions: RiskContribution[],
): string[] {
  const sentences: string[] = [];
  for (const contribution of contributions) {
    const sentence = SENTENCE_BUILDERS[contribution.factor](features, factors[contribution.factor]);
    if (sentence) sentences.push(sentence);
  }
  return sentences;
}

/** The top `maxCount` meaningful contributors, named by their most specific driving sub-factor (e.g. "Snowfall", not just "Weather") — never a long tail of tiny-importance factors. */
export function buildDominantFactors(
  factors: Record<RiskFactorKey, FactorScore>,
  contributions: RiskContribution[],
  maxCount = 3,
): string[] {
  const dominant: string[] = [];

  for (const contribution of contributions) {
    if (contribution.weightedContribution <= 0) continue;
    const factorScore = factors[contribution.factor];
    const topSub = [...factorScore.contributions].sort((a, b) => b.rawValue * b.weight - a.rawValue * a.weight)[0];
    dominant.push(topSub ? topSub.label : FACTOR_LABELS[contribution.factor]);
    if (dominant.length >= maxCount) break;
  }

  return dominant;
}
