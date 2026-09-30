import type { Route } from "@/lib/route/types";
import type { RouteWeatherAnalysis } from "@/lib/weather/types";
import type { RouteTrafficResult } from "@/lib/traffic/types";
import type { TransitAnalysis } from "@/lib/transit/types";
import { buildCommuteFeatures } from "./buildFeatures";
import { riskModelV0Config } from "./config";
import { computeConfigFingerprint } from "./configFingerprint";
import { buildDominantFactors, buildExplanation } from "./explanation";
import { computeOverallRisk } from "./overallRisk";
import { scoreRoadEventFactor } from "./roadEventScore";
import { assessPredictionSufficiency } from "./sufficiency";
import { scoreTrafficFactor } from "./trafficScore";
import { scoreTransitFactor } from "./transitScore";
import { scoreWeatherFactor } from "./weatherScore";
import type { CommuteFeatureSet, ExperimentalCommuteRiskV0 } from "./types";

export interface ComputeCommuteRiskInput {
  route: Route;
  weather: RouteWeatherAnalysis | null;
  traffic: RouteTrafficResult | null;
  transit: TransitAnalysis | null;
  /** The analysis instant — injectable for deterministic tests. */
  now?: Date;
}

/**
 * Runs the scoring pipeline (factors → overall index → sufficiency →
 * explanation) on an already-built `CommuteFeatureSet`. Pure and
 * dependent on nothing but its arguments — this is what makes a stored
 * `PredictionSnapshot` reproducible later purely from its
 * `featureSnapshot`, without refetching any provider
 * (`lib/evaluation/reproduce.ts`), and it's what `computeCommuteRisk`
 * itself calls after building features from live data.
 */
export function scoreFeatures(features: CommuteFeatureSet, now: Date): ExperimentalCommuteRiskV0 {
  const factors = {
    weather: scoreWeatherFactor(features),
    traffic: scoreTrafficFactor(features),
    transit: scoreTransitFactor(features),
    roadEvents: scoreRoadEventFactor(features),
  };

  const { overallIndex, label, weighting, contributions } = computeOverallRisk(features, factors);
  const dominantFactors = buildDominantFactors(factors, contributions);
  const explanation = buildExplanation(features, factors, contributions);
  const sufficiency = assessPredictionSufficiency(features, factors);

  return {
    modelVersion: riskModelV0Config.modelVersion,
    configFingerprint: computeConfigFingerprint(),
    analyzedAt: now,
    overallIndex,
    label,
    predictionStatus: sufficiency.status,
    sufficiency,
    factors,
    weighting,
    contributions,
    dominantFactors,
    explanation,
    dataCoverage: features.dataCoverage,
    features,
  };
}

/**
 * WinterRoute's V0 experimental commute-risk index — the single entry
 * point for `lib/scoring/`. Pure and deterministic: no fetching, no I/O,
 * same output for the same input every time. See `types.ts`'s doc
 * comment on `ExperimentalCommuteRiskV0` for what the resulting index
 * does and does NOT mean, and on `RiskPredictionStatus` for why
 * `overallIndex`/`label` must never be shown without checking
 * `predictionStatus` first.
 */
export function computeCommuteRisk(input: ComputeCommuteRiskInput): ExperimentalCommuteRiskV0 {
  const now = input.now ?? new Date();
  const features = buildCommuteFeatures({ ...input, now });
  return scoreFeatures(features, now);
}
