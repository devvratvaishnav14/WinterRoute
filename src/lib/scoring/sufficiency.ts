import { riskModelV0Config } from "./config";
import type { CommuteFeatureSet, FactorScore, PredictionSufficiency, RiskFactorKey } from "./types";

const FACTOR_ORDER: RiskFactorKey[] = ["weather", "traffic", "transit", "roadEvents"];

const FACTOR_LABELS: Record<RiskFactorKey, string> = {
  weather: "Weather",
  traffic: "Traffic",
  transit: "Transit",
  roadEvents: "Road events",
};

/**
 * The factors considered essential for THIS specific route, derived from
 * the UNION of `config.sufficiency.essentialFactorsByMode` across every
 * distinct segment mode the route actually contains — not the user's
 * single originally-requested mode. A mixed walk+bus trip needs *either*
 * weather or transit evidence to be considered scoreable at all; losing
 * both would mean losing every essential signal.
 */
function essentialFactorsForRoute(features: CommuteFeatureSet): Set<RiskFactorKey> {
  const essential = new Set<RiskFactorKey>();
  const { essentialFactorsByMode } = riskModelV0Config.sufficiency;

  for (const segment of features.segments) {
    const factorsForMode = essentialFactorsByMode[segment.mode as keyof typeof essentialFactorsByMode] ?? [];
    for (const factor of factorsForMode) essential.add(factor);
  }

  // Defensive fallback for a route with no segments at all (shouldn't happen in practice) — weather is always at least potentially relevant.
  if (essential.size === 0) essential.add("weather");

  return essential;
}

/**
 * Decides whether there's enough evidence to present a meaningful risk
 * index for this trip. Mode-aware by construction (via
 * `essentialFactorsForRoute`) and forecast-horizon-aware *without* any
 * separate horizon-specific rule: a far-future transit trip with no
 * realtime update yet is `"scored"` at the factor level (schedule-only is
 * valid evidence, not a failure — see `transitScore.ts`), so it never
 * trips the "essential factor missing" check just because it's far away.
 * The same is true for weather at any supported horizon (at least one of
 * the three models covers up to 72h). Horizon-awareness falls out of the
 * factor-scoring layer's own honesty, not a bolt-on rule here.
 */
export function assessPredictionSufficiency(
  features: CommuteFeatureSet,
  factors: Record<RiskFactorKey, FactorScore>,
): PredictionSufficiency {
  const essential = essentialFactorsForRoute(features);
  const applicable = FACTOR_ORDER.filter((factor) => factors[factor].status !== "not-applicable");
  const applicableUnavailable = applicable.filter((factor) => factors[factor].status === "unavailable");
  const essentialScored = [...essential].filter((factor) => factors[factor].status === "scored");

  if (essentialScored.length === 0) {
    return {
      status: "insufficient-data",
      reasons: [...essential].map((factor) => `${FACTOR_LABELS[factor]} data unavailable`),
      missingSources: applicableUnavailable,
    };
  }

  if (applicableUnavailable.length === 0) {
    return { status: "available", reasons: [], missingSources: [] };
  }

  return {
    status: "limited-data",
    reasons: applicableUnavailable.map((factor) => `${FACTOR_LABELS[factor]} data unavailable`),
    missingSources: applicableUnavailable,
  };
}
