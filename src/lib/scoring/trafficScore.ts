import { riskModelV0Config, scoreOnCurve } from "./config";
import type { CommuteFeatureSet, FactorContribution, FactorScore } from "./types";

/**
 * TrafficSeverityScore — only ever `"scored"` for a route with a `drive`
 * segment; `"not-applicable"` for every other mode (see
 * docs/architecture.md "Not all modes are drive"), `"unavailable"` when
 * Google's traffic-aware call itself failed.
 *
 * `trafficDelayMinutes` is the primary, dominant signal. `trafficJamRouteShare`/
 * `slowRouteShare` describe *the same underlying congestion* Google's
 * delay figure already reflects — they're added only as small, capped
 * corroborating bonuses, not full independent severity, specifically to
 * avoid double-counting one phenomenon as two. See
 * docs/decisions/0008-risk-model-v0.md "Avoiding double counting."
 */
export function scoreTrafficFactor(features: CommuteFeatureSet): FactorScore {
  const traffic = features.traffic;

  if (traffic.availability === "not-applicable") {
    return {
      factor: "traffic",
      status: "not-applicable",
      reason: "Traffic-aware delay is not calculated for this travel mode.",
      contributions: [],
    };
  }

  if (traffic.availability !== "available") {
    return {
      factor: "traffic",
      status: "unavailable",
      reason: "Traffic data was unavailable for this trip.",
      contributions: [],
    };
  }

  const { delayCurve, trafficJamShareWeight, slowShareWeight } = riskModelV0Config.traffic;
  const contributions: FactorContribution[] = [];

  const delayMinutes = traffic.trafficDelayMinutes ?? 0;
  const delayScore = scoreOnCurve(delayMinutes, delayCurve);
  contributions.push({
    key: "delay",
    label: "Traffic delay",
    rawValue: delayScore,
    weight: 1,
    detail: `${delayMinutes.toFixed(0)} min added vs. reference duration`,
  });

  let corroboratingBonus = 0;

  if (traffic.trafficJamRouteShare) {
    const bonus = Math.min(trafficJamShareWeight, traffic.trafficJamRouteShare * trafficJamShareWeight * 2);
    if (bonus > 0) {
      contributions.push({
        key: "trafficJamShare",
        label: "Traffic-jam route share",
        rawValue: bonus,
        weight: 1,
        detail: `${Math.round(traffic.trafficJamRouteShare * 100)}% of route in traffic-jam conditions`,
      });
      corroboratingBonus += bonus;
    }
  }

  if (traffic.slowRouteShare) {
    const bonus = Math.min(slowShareWeight, traffic.slowRouteShare * slowShareWeight * 2);
    if (bonus > 0) {
      contributions.push({
        key: "slowShare",
        label: "Slow route share",
        rawValue: bonus,
        weight: 1,
        detail: `${Math.round(traffic.slowRouteShare * 100)}% of route in slow conditions`,
      });
      corroboratingBonus += bonus;
    }
  }

  const overall = Math.min(100, delayScore + corroboratingBonus);
  return { factor: "traffic", status: "scored", score: Math.round(overall), contributions };
}
