import type { Route } from "@/lib/route/types";
import { buildCommuteFeatures } from "@/lib/scoring/buildFeatures";
import type { RouteTrafficResult } from "@/lib/traffic/types";
import type { TransitAnalysis } from "@/lib/transit/types";
import type { RouteWeatherAnalysis } from "@/lib/weather/types";
import { buildCarContributions, buildRoadEventWidening } from "./carDuration";
import { combineContributions, directlyObservedDelayMinutes, modeledAdditionalDelayMinutes } from "./combine";
import { computeDurationConfigFingerprint } from "./configFingerprint";
import { durationModelV0Config } from "./config";
import { buildDurationExplanation, buildDurationNotes, determineTimingBasis } from "./explanation";
import { buildHorizonWidening } from "./horizonWidening";
import { assessDurationSufficiency } from "./sufficiency";
import { analyzeTransitTimeline, buildTransitUncertaintyContributions } from "./transitTimeline";
import type { DelayContribution, DurationDataCoverage, DurationSourceFreshness, ExpectedCommuteDurationV0 } from "./types";
import { buildWalkCycleContributions } from "./walkCycleDuration";

export interface ComputeExpectedDurationInput {
  route: Route;
  weather: RouteWeatherAnalysis | null;
  traffic: RouteTrafficResult | null;
  transit: TransitAnalysis | null;
  /** The analysis instant — injectable for deterministic tests. */
  now?: Date;
}

function baselineMinutesFor(route: Route): number {
  if (route.baselineDurationMinutes !== undefined) return route.baselineDurationMinutes;
  return route.segments.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
}

function toDurationDataCoverage(features: ReturnType<typeof buildCommuteFeatures>["dataCoverage"]): DurationDataCoverage {
  return { traffic: features.traffic, weather: features.weather, transit: features.transit, roadEvents: features.roadEvents };
}

function buildSourceFreshness(features: ReturnType<typeof buildCommuteFeatures>, transit: TransitAnalysis | null): DurationSourceFreshness {
  let transitRecency: DurationSourceFreshness["transitRecency"] = "not-applicable";
  if (transit?.status === "analyzed") {
    transitRecency = transit.transitSegments.some((s) => s.recency === "near-term") ? "near-term" : "future";
  }

  return {
    weatherModelsAvailable: features.weather.modelsAvailable,
    trafficRecency: features.traffic.recency,
    transitRecency,
  };
}

/**
 * WinterRoute's V0 expected-commute-duration model — the single entry
 * point for `lib/duration/`. Pure and deterministic: no fetching, no
 * I/O, same output for the same input every time.
 *
 * A SEPARATE prediction from `computeCommuteRisk`/`ExperimentalCommuteRiskV0`
 * — this never reads a risk score or uses it as a multiplier. Both
 * models happen to share the same underlying `buildCommuteFeatures` step
 * (the same factual weather/traffic/transit/road-event aggregates feed
 * both), but from there they diverge completely: the risk model combines
 * per-factor SEVERITY scores into a 0-100 index, while this model
 * performs TIMING arithmetic (baseline + factual deltas + bounded
 * heuristic ranges) to produce a minute range. See
 * docs/decisions/0010-duration-model-v0.md "Risk vs. duration: why two
 * models" for a test proving the two can diverge independently.
 */
export function computeExpectedDuration(input: ComputeExpectedDurationInput): ExpectedCommuteDurationV0 {
  const { route, weather, traffic, transit } = input;
  const now = input.now ?? new Date();

  const features = buildCommuteFeatures({ route, weather, traffic, transit, now });
  const baselineMinutes = baselineMinutesFor(route);

  const timeline = analyzeTransitTimeline(route, transit);
  const sufficiency = assessDurationSufficiency(route, features, timeline);

  const contributions: DelayContribution[] = [
    ...buildCarContributions(features, baselineMinutes),
    ...buildWalkCycleContributions(features),
    ...buildRoadEventWidening(features),
    ...timeline.contributions,
    ...buildTransitUncertaintyContributions(route, transit),
    ...buildHorizonWidening(features),
  ];

  if (sufficiency.status === "route-disrupted") {
    contributions.push({
      key: "transitDisruption",
      label: "Itinerary disrupted",
      centralMinutes: 0,
      lowerMinutes: 0,
      upperMinutes: durationModelV0Config.transit.disruptionUpperWideningMinutes,
      provenance: "heuristic-v0",
      explanation: "The planned itinerary appears disrupted (a missed connection or cancellation) — the upper end of the estimate allows for a substantially longer trip than originally planned.",
      appliesTo: "route",
    });
  }

  const range = combineContributions(baselineMinutes, contributions);

  return {
    modelVersion: durationModelV0Config.modelVersion,
    configFingerprint: computeDurationConfigFingerprint(),
    analyzedAt: now,
    baselineDurationMinutes: baselineMinutes,
    centralEstimateMinutes: range.centralEstimateMinutes,
    lowerBoundMinutes: range.lowerBoundMinutes,
    upperBoundMinutes: range.upperBoundMinutes,
    directlyObservedDelayMinutes: directlyObservedDelayMinutes(contributions),
    modeledAdditionalDelayMinutes: modeledAdditionalDelayMinutes(contributions),
    uncertaintyBufferMinutes: {
      lower: Math.max(0, range.centralEstimateMinutes - range.lowerBoundMinutes),
      upper: Math.max(0, range.upperBoundMinutes - range.centralEstimateMinutes),
    },
    predictionStatus: sufficiency.status,
    statusReasons: sufficiency.reasons,
    dataCoverage: toDurationDataCoverage(features.dataCoverage),
    contributingDelayFactors: contributions,
    explanation: buildDurationExplanation(contributions),
    notes: buildDurationNotes(contributions),
    timingBasis: determineTimingBasis(features, contributions),
    sourceFreshness: buildSourceFreshness(features, transit),
    features,
  };
}
