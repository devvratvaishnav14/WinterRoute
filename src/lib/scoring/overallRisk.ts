import { riskModelV0Config } from "./config";
import type { CommuteFeatureSet, FactorScore, RiskContribution, RiskFactorKey, RiskFactorWeighting, RiskLabel } from "./types";

const FACTOR_ORDER: RiskFactorKey[] = ["weather", "traffic", "transit", "roadEvents"];

export const FACTOR_LABELS: Record<RiskFactorKey, string> = {
  weather: "Weather",
  traffic: "Traffic",
  transit: "Transit",
  roadEvents: "Road events",
};

/**
 * The mode/duration-weighted relevance each factor has for THIS route,
 * before normalization — the duration-weighted average of
 * `config.overall.modeFactorRelevance` across the route's real segments.
 * A mixed trip's weighting reflects its actual segment-duration
 * composition, not just the user's single originally-selected mode. See
 * docs/architecture.md "Overall score weighting."
 */
export function computeRawFactorWeighting(features: CommuteFeatureSet): Record<RiskFactorKey, number> {
  const { modeFactorRelevance } = riskModelV0Config.overall;
  const rawWeights: Record<RiskFactorKey, number> = { weather: 0, traffic: 0, transit: 0, roadEvents: 0 };

  const totalDurationShare = features.segments.reduce((sum, s) => sum + (s.routeDurationShare ?? 0), 0);

  if (totalDurationShare > 0) {
    for (const segment of features.segments) {
      const share = segment.routeDurationShare ?? 0;
      const relevance =
        modeFactorRelevance[segment.mode as keyof typeof modeFactorRelevance] ?? modeFactorRelevance.drive;
      for (const factor of FACTOR_ORDER) rawWeights[factor] += share * relevance[factor];
    }
  } else if (features.segments.length > 0) {
    // No duration data at all on any segment — fall back to an unweighted average across whichever segment modes exist, rather than a zeroed-out weighting.
    for (const segment of features.segments) {
      const relevance =
        modeFactorRelevance[segment.mode as keyof typeof modeFactorRelevance] ?? modeFactorRelevance.drive;
      for (const factor of FACTOR_ORDER) rawWeights[factor] += relevance[factor] / features.segments.length;
    }
  }

  return rawWeights;
}

/** Exported directly for boundary testing — the label bands are exact-threshold `<` comparisons, and a `<=`/`<` mistake here would be an easy, easy-to-miss bug. */
export function labelFor(index: number): RiskLabel {
  const { labelThresholds } = riskModelV0Config.overall;
  if (index < labelThresholds.low) return "Low";
  if (index < labelThresholds.moderate) return "Moderate";
  if (index < labelThresholds.high) return "High";
  return "Very High";
}

export interface OverallRiskResult {
  overallIndex: number;
  label: RiskLabel;
  weighting: RiskFactorWeighting[];
  contributions: RiskContribution[];
}

/**
 * Combines the four factor scores into one overall index.
 *
 * Critically, normalization happens ONLY over factors whose status is
 * `"scored"` — a `"not-applicable"` or `"unavailable"` factor is dropped
 * from both the numerator and the denominator entirely, never averaged in
 * as an implicit zero (which would artificially *reduce* risk). If zero
 * factors end up scored (every source unavailable/not-applicable — an
 * extreme, degenerate case), the index is 0 ("Low") purely because there
 * is nothing to sum — this is a known V0 limitation (an absence of
 * evidence, not evidence of low risk) and `dataCoverage` on the result
 * will show every source as unavailable, so a caller/UI should treat that
 * combination specially rather than reading the index at face value. See
 * docs/decisions/0008-risk-model-v0.md "Known weaknesses."
 */
export function computeOverallRisk(
  features: CommuteFeatureSet,
  factorScores: Record<RiskFactorKey, FactorScore>,
): OverallRiskResult {
  const rawWeights = computeRawFactorWeighting(features);
  const rawWeighting: RiskFactorWeighting[] = FACTOR_ORDER.map((factor) => ({ factor, rawWeight: rawWeights[factor] }));

  const applicable = rawWeighting.filter((w) => factorScores[w.factor].status === "scored");
  const totalRawWeight = applicable.reduce((sum, w) => sum + w.rawWeight, 0);

  const weighting: RiskFactorWeighting[] = rawWeighting.map((w) => {
    if (factorScores[w.factor].status !== "scored") return w;
    const normalizedWeight =
      totalRawWeight > 0 ? w.rawWeight / totalRawWeight : applicable.length > 0 ? 1 / applicable.length : undefined;
    return { ...w, normalizedWeight };
  });

  const contributions: RiskContribution[] = weighting
    .filter((w): w is RiskFactorWeighting & { normalizedWeight: number } => w.normalizedWeight !== undefined)
    .map((w) => {
      const score = factorScores[w.factor].score ?? 0;
      return {
        factor: w.factor,
        label: FACTOR_LABELS[w.factor],
        score,
        weight: w.normalizedWeight,
        weightedContribution: score * w.normalizedWeight,
      };
    })
    .sort((a, b) => b.weightedContribution - a.weightedContribution);

  const rawIndex = contributions.reduce((sum, c) => sum + c.weightedContribution, 0);
  const overallIndex = Math.max(0, Math.min(100, Math.round(rawIndex)));

  return { overallIndex, label: labelFor(overallIndex), weighting, contributions };
}
