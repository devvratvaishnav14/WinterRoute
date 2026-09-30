import type { ExpectedCommuteDurationV0 } from "@/lib/duration/types";
import type { RouteTrafficResult } from "@/lib/traffic/types";
import type { ExperimentalCommuteRiskV0 } from "@/lib/scoring/types";
import type { CommuteTimingRecommendationV0 } from "@/lib/timing/types";
import type { TransitAnalysis } from "@/lib/transit/types";
import type { TimePreference, TransportMode } from "@/lib/trip/types";
import type { RouteWeatherAnalysis } from "@/lib/weather/types";
import type { PredictionSnapshot, PredictionSnapshotDurationPrediction, PredictionSnapshotTimingRecommendation } from "./types";

function generatePredictionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for an environment without `crypto.randomUUID` — not cryptographically strong, only needs to be practically unique for a dev-only identifier.
  return `pred-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function providersUsedFor(
  weather: RouteWeatherAnalysis | null,
  traffic: RouteTrafficResult | null,
  transit: TransitAnalysis | null,
): string[] {
  const providers = new Set<string>();
  if (weather && weather.samples.length > 0) {
    providers.add("open-meteo");
    if (weather.alerts.length > 0 || weather.alertStatus === "ok") providers.add("eccc");
  }
  if (traffic?.trafficAnalysis.status === "analyzed") providers.add("google-routes");
  if (traffic && traffic.roadEventStatus === "ok") providers.add("drivebc");
  if (transit?.status === "analyzed") providers.add("translink");
  return Array.from(providers);
}

export interface CreatePredictionSnapshotParams {
  risk: ExperimentalCommuteRiskV0;
  requestedMode: TransportMode;
  timePreference: TimePreference;
  selectedTripTime: Date;
  weather: RouteWeatherAnalysis | null;
  traffic: RouteTrafficResult | null;
  transit: TransitAnalysis | null;
  /** Injectable for deterministic tests; defaults to a generated UUID. */
  predictionId?: string;
  /** Optional — when provided, the SAME trip's expected-duration prediction is preserved alongside the risk index. Omitting it is fully valid (e.g. a caller that only computed risk). */
  duration?: ExpectedCommuteDurationV0;
  /** Optional — when provided, the SAME trip's Arrive-By/Leave-At timing recommendation is preserved too. */
  timing?: CommuteTimingRecommendationV0;
}

function toDurationPrediction(duration: ExpectedCommuteDurationV0): PredictionSnapshotDurationPrediction {
  return {
    modelVersion: duration.modelVersion,
    configFingerprint: duration.configFingerprint,
    baselineDurationMinutes: duration.baselineDurationMinutes,
    centralEstimateMinutes: duration.centralEstimateMinutes,
    lowerBoundMinutes: duration.lowerBoundMinutes,
    upperBoundMinutes: duration.upperBoundMinutes,
    directlyObservedDelayMinutes: duration.directlyObservedDelayMinutes,
    modeledAdditionalDelayMinutes: duration.modeledAdditionalDelayMinutes,
    predictionStatus: duration.predictionStatus,
    dataCoverage: duration.dataCoverage,
    contributingDelayFactors: duration.contributingDelayFactors,
  };
}

function toTimingRecommendation(timing: CommuteTimingRecommendationV0): PredictionSnapshotTimingRecommendation {
  const targetOrDepartureTime = timing.arriveBy?.targetArrivalTime ?? timing.leaveAt!.selectedDepartureTime;
  const typicalReferenceTime = timing.arriveBy?.typicalDepartureTime ?? timing.leaveAt?.typicalArrivalTime;
  const expectedArrivalWindow =
    timing.arriveBy?.expectedArrivalWindowWhenLeavingRecommended ??
    (timing.leaveAt?.expectedArrivalLower && timing.leaveAt.expectedArrivalCentral && timing.leaveAt.expectedArrivalUpper
      ? { lower: timing.leaveAt.expectedArrivalLower, central: timing.leaveAt.expectedArrivalCentral, upper: timing.leaveAt.expectedArrivalUpper }
      : undefined);

  return {
    modelVersion: timing.modelVersion,
    configFingerprint: timing.configFingerprint,
    preference: timing.preference,
    status: timing.status,
    targetOrDepartureTime,
    typicalReferenceTime,
    recommendedDepartureTime: timing.arriveBy?.recommendedDepartureTime,
    leaveEarlierByMinutes: timing.arriveBy?.leaveEarlierByMinutes,
    expectedArrivalWindow,
  };
}

/**
 * Wraps an already-computed `ExperimentalCommuteRiskV0` (plus the small
 * amount of trip context it doesn't itself carry — the user's originally
 * requested mode/time-preference/selected time) into an immutable
 * `PredictionSnapshot`. Does not call any provider — everything here
 * comes from data already computed in-memory.
 */
export function createPredictionSnapshot(params: CreatePredictionSnapshotParams): PredictionSnapshot {
  const { risk, requestedMode, timePreference, selectedTripTime, weather, traffic, transit, duration, timing } = params;
  const features = risk.features;

  return {
    predictionId: params.predictionId ?? generatePredictionId(),
    modelVersion: risk.modelVersion,
    configFingerprint: risk.configFingerprint,
    createdAt: risk.analyzedAt,
    tripContext: {
      originLabel: features.originLabel,
      destinationLabel: features.destinationLabel,
      requestedMode,
      timePreference,
      selectedTripTime,
      routeStartTime: features.temporal.routeStartTime,
      routeEndTime: features.temporal.routeEndTime,
      baselineDurationMinutes: features.temporal.baselineDurationMinutes,
      totalDistanceMeters: features.totalDistanceMeters,
      forecastHorizonHours: features.temporal.forecastHorizonHours,
      actualRouteModeComposition: features.temporal.transportComposition,
    },
    featureSnapshot: features,
    factorScores: risk.factors,
    weighting: risk.weighting,
    contributions: risk.contributions,
    overallIndex: risk.overallIndex,
    label: risk.label,
    predictionStatus: risk.predictionStatus,
    sufficiency: risk.sufficiency,
    dataCoverage: risk.dataCoverage,
    sourceFreshness: {
      weatherModelsAvailable: features.weather.modelsAvailable,
      weatherSamplePoints: features.weather.samplePointCount,
      trafficRecency: features.traffic.recency,
      transitFeedTimestamps: transit?.status === "analyzed" ? transit.feedTimestamps : undefined,
    },
    providersUsed: providersUsedFor(weather, traffic, transit),
    durationPrediction: duration ? toDurationPrediction(duration) : undefined,
    timingRecommendation: timing ? toTimingRecommendation(timing) : undefined,
  };
}
