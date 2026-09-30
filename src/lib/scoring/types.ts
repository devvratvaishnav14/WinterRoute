import type { SegmentTransportMode } from "@/lib/route/types";
import type { WeatherAlertType } from "@/lib/weather/types";
import type { RoadEventSeverity } from "@/lib/traffic/types";
import type { TransitAlertEffect, TransitMatchQuality, TransitSegmentStatus } from "@/lib/transit/types";
import type { VancouverWeekday } from "@/lib/time/vancouverTime";

/**
 * WinterRoute's V0 feature/scoring layer turns the already-collected
 * factual data (route structure, weather, traffic, road events, transit)
 * into an interpretable heuristic risk index. It is deliberately NOT a
 * calibrated probability model — see `ExperimentalCommuteRiskV0`'s doc
 * comment and `docs/decisions/0008-risk-model-v0.md`.
 *
 * Distinct layers, on purpose (never scoring raw provider JSON directly):
 *
 *   Route structure + observation data (Route, RouteWeatherAnalysis,
 *   RouteTrafficResult, TransitAnalysis — all already-existing types)
 *     -> SegmentFeatureSet / CommuteFeatureSet   (this file, "features")
 *     -> FactorScore per factor                   (this file, "scoring")
 *     -> ExperimentalCommuteRiskV0                 (this file, "result")
 *
 * V1 deliberately excludes bus/vehicle crowding entirely — TransLink's
 * real GTFS-Realtime feed was confirmed (transit stage) to publish no
 * usable `occupancy_status`/`occupancy_percentage` data, so there is
 * nothing factual to build a crowding feature from. This is a deliberate,
 * evidence-based scope decision, not an oversight — see
 * docs/decisions/0007-transit-data-integration.md and
 * docs/decisions/0008-risk-model-v0.md.
 */

// ---------------------------------------------------------------------------
// Shared availability vocabulary
// ---------------------------------------------------------------------------

/**
 * Generic feature-level availability, used where a single factor doesn't
 * need its own bespoke enum. "not-yet-available" is distinct from
 * "unavailable": the former means evidence could exist later (e.g. a
 * transit trip too far out for realtime to have published anything yet),
 * the latter means a source genuinely failed. Never collapse either into
 * "available" with a fabricated value.
 */
export type FeatureAvailability = "available" | "not-applicable" | "not-yet-available" | "unavailable";

// ---------------------------------------------------------------------------
// Segment-level features
// ---------------------------------------------------------------------------

/**
 * Weather features for one route segment, derived only from the
 * `RouteWeatherSample`s the weather-sampling module itself tagged with
 * this segment's ID (`lib/weather/sampling.ts`) — never re-derived by
 * proximity here. A segment can genuinely have zero samples (e.g. a short
 * final segment whose only boundary point is the route's untagged
 * destination) — `availability: "unavailable"` in that case, never a
 * fabricated value.
 */
export interface SegmentWeatherFeatures {
  availability: "available" | "unavailable";
  sampleCount: number;
  minTemperatureC?: number;
  maxTemperatureC?: number;
  minApparentTemperatureC?: number;
  /** Largest (max - min) spread across models observed at any single sample point in this segment. */
  temperatureModelSpreadC?: number;
  maxPrecipitationMm?: number;
  /** modelsPredictingPrecipitation / modelsWithDataAnywhereInSegment, across this segment's own samples. */
  precipitationAgreementRatio?: number;
  maxSnowfallCm?: number;
  snowAgreementRatio?: number;
  maxWindSpeedKmh?: number;
  maxWindGustKmh?: number;
  minVisibilityKm?: number;
  belowFreezingTemperature: boolean;
  precipitationNearFreezing: boolean;
  snowfallPresent: boolean;
}

/** Traffic features for one segment — only ever `"available"` for a `drive` segment; every other mode is structurally `"not-applicable"` (see docs/architecture.md "Not all modes are drive"). */
export interface SegmentTrafficFeatures {
  availability: FeatureAvailability;
  trafficDelayMinutes?: number;
  /** trafficDelayMinutes / referenceBaselineDurationMinutes, bounded to avoid a division blow-up on a very short segment. */
  trafficDelayRatio?: number;
  normalRouteShare?: number;
  slowRouteShare?: number;
  trafficJamRouteShare?: number;
}

/** Transit features for one segment — only ever `"available"` for a `bus`/`rail` segment. */
export interface SegmentTransitFeatures {
  availability: FeatureAvailability;
  status?: TransitSegmentStatus;
  matchQuality?: TransitMatchQuality;
  departureDelaySeconds?: number;
  arrivalDelaySeconds?: number;
  isCanceled: boolean;
  hasSkippedStop: boolean;
  relevantAlertCount: number;
}

/** Road-event features attributed to one segment by real geometric proximity (same 300m threshold as `lib/traffic/roadEvents.ts`), checked for every mode. */
export interface SegmentRoadEventFeatures {
  availability: "checked" | "unavailable";
  relevantEventCount: number;
  incidentCount: number;
  constructionCount: number;
  weatherRelatedEventCount: number;
  /**
   * DriveBC's schema has no explicit "closure" flag — this counts
   * `severity: "major"` events as the closest defensible proxy, not an
   * assertion that the road is literally closed. See
   * docs/decisions/0008-risk-model-v0.md.
   */
  majorSeverityEventCount: number;
}

export interface SegmentFeatureSet {
  segmentId: string;
  mode: SegmentTransportMode;
  durationMinutes?: number;
  distanceMeters?: number;
  /** durationMinutes / total route duration — the exposure-weighting basis; see docs/architecture.md "Exposure weighting." */
  routeDurationShare?: number;
  weather: SegmentWeatherFeatures;
  traffic: SegmentTrafficFeatures;
  transit: SegmentTransitFeatures;
  roadEvents: SegmentRoadEventFeatures;
}

// ---------------------------------------------------------------------------
// Route-level (aggregated) features
// ---------------------------------------------------------------------------

/**
 * Factual temporal/context features. `isLikelyRushHour` is stored purely
 * as contextual information for future analysis — it is NEVER read by any
 * scoring function in V0, since real traffic/transit providers already
 * capture actual conditions directly (see `docs/decisions/0008-risk-model-v0.md`
 * "No rush-hour penalty").
 */
export interface TemporalFeatures {
  hourOfDay: number;
  weekday: VancouverWeekday;
  isWeekend: boolean;
  isLikelyRushHour: boolean;
  /** Hours between the analysis instant and the route's own start time. */
  forecastHorizonHours: number;
  baselineDurationMinutes?: number;
  routeStartTime?: Date;
  routeEndTime?: Date;
  segmentCount: number;
  transportComposition: Array<{ mode: SegmentTransportMode; durationMinutes: number; durationShare: number }>;
}

export interface RouteWeatherFeatures {
  availability: "complete" | "partial" | "unavailable";
  modelsAvailable: number;
  samplePointCount: number;
  minTemperatureC?: number;
  maxTemperatureC?: number;
  minApparentTemperatureC?: number;
  temperatureModelSpreadC?: number;
  maxPrecipitationMm?: number;
  precipitationAgreementRatio?: number;
  maxSnowfallCm?: number;
  snowAgreementRatio?: number;
  maxWindSpeedKmh?: number;
  maxWindGustKmh?: number;
  minVisibilityKm?: number;
  relevantAlertCount: number;
  alertTypes: WeatherAlertType[];
  freezingRelatedAlert: boolean;
  /** Share (0-1) of total route duration made up of segments classified as exposed to "notable" weather — see docs/architecture.md for the exact V0 rule. */
  notableWeatherExposureShare: number;
}

export interface RouteTrafficFeatures {
  availability: FeatureAvailability;
  recency?: "near-term" | "future";
  trafficReferenceDurationMinutes?: number;
  trafficAwareDurationMinutes?: number;
  trafficDelayMinutes?: number;
  trafficDelayRatio?: number;
  normalRouteShare?: number;
  slowRouteShare?: number;
  trafficJamRouteShare?: number;
}

export interface RouteRoadEventFeatures {
  availability: "checked" | "unavailable";
  relevantEventCount: number;
  incidentCount: number;
  constructionCount: number;
  specialEventCount: number;
  weatherRelatedEventCount: number;
  majorSeverityEventCount: number;
  highestSeverity?: RoadEventSeverity;
}

export interface RouteTransitFeatures {
  availability: FeatureAvailability;
  transitSegmentCount: number;
  realtimeMatchedSegmentCount: number;
  scheduleOnlySegmentCount: number;
  unmatchedSegmentCount: number;
  maxDepartureDelaySeconds?: number;
  maxArrivalDelaySeconds?: number;
  /** Only across segments that actually have a realtime update — never includes schedule-only segments as an implicit zero. */
  meanDelaySecondsAcrossRealtimeSegments?: number;
  medianDelaySecondsAcrossRealtimeSegments?: number;
  canceledSegmentCount: number;
  skippedStopSegmentCount: number;
  relevantSegmentAlertCount: number;
  relevantSystemAlertCount: number;
  /** Distinct GTFS-RT alert `effect`s observed across every relevant segment + system alert — used by `transitScore.ts` to weigh alert severity without the scoring layer needing raw `TransitAlert` objects. */
  relevantAlertEffects: TransitAlertEffect[];
  /** Number of transit-to-transit transitions in the route (a proxy for scheduled transfers). */
  transferCount: number;
}

/**
 * Coarse, per-domain data-completeness summary — deliberately never
 * collapsed into a single fake confidence percentage (see
 * docs/decisions/0008-risk-model-v0.md "No fabricated confidence").
 */
export interface DataCoverage {
  weather: "complete" | "partial" | "unavailable";
  traffic: "complete" | "partial" | "not-applicable" | "unavailable";
  transit: "realtime" | "scheduled-only" | "partial" | "not-applicable" | "unavailable";
  roadEvents: "checked" | "unavailable";
  weatherModelsAvailable: number;
  weatherSamplePoints: number;
  transitRealtimeMatchedSegments: number;
}

export interface CommuteFeatureSet {
  originLabel: string;
  destinationLabel: string;
  totalDistanceMeters?: number;
  temporal: TemporalFeatures;
  weather: RouteWeatherFeatures;
  traffic: RouteTrafficFeatures;
  roadEvents: RouteRoadEventFeatures;
  transit: RouteTransitFeatures;
  segments: SegmentFeatureSet[];
  dataCoverage: DataCoverage;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type RiskFactorKey = "weather" | "traffic" | "transit" | "roadEvents";

export type FactorScoreStatus = "scored" | "not-applicable" | "unavailable";

/** One named, weighted contributor inside a factor's score — e.g. "snowfall" inside `WeatherSeverityScore`. Never hidden; always listed for the dev-detail view. */
export interface FactorContribution {
  key: string;
  label: string;
  /** 0-100, this contributor's own severity before it's combined with others. */
  rawValue: number;
  /** Relative weight this contributor was given inside its factor's combination. */
  weight: number;
  detail: string;
}

export interface FactorScore {
  factor: RiskFactorKey;
  status: FactorScoreStatus;
  /** Present only when `status === "scored"`. */
  score?: number;
  /** Present when `status !== "scored"` — why this factor isn't contributing. */
  reason?: string;
  contributions: FactorContribution[];
}

export interface RiskFactorWeighting {
  factor: RiskFactorKey;
  /** The mode/duration-weighted relevance this factor was given, before normalization across applicable factors. */
  rawWeight: number;
  /** Only present for factors that ended up `"scored"` — normalized so all `normalizedWeight`s sum to 1. */
  normalizedWeight?: number;
}

export interface RiskContribution {
  factor: RiskFactorKey;
  label: string;
  score: number;
  weight: number;
  weightedContribution: number;
}

export type RiskLabel = "Low" | "Moderate" | "High" | "Very High";

/**
 * Whether there's enough evidence to present a meaningful risk index at
 * all — separate from the index's own value, specifically to fix "no
 * data == Low" (an absence of evidence is not evidence of low
 * disruption). See `sufficiency.ts` and
 * docs/decisions/0009-v0-hardening-and-evaluation-design.md "Fixing the
 * no-data-equals-Low problem."
 *
 * - `"available"`: every applicable factor for this trip was scored.
 * - `"limited-data"`: at least one *essential* factor for this trip's
 *   actual mode(s) was scored, but some applicable factor (essential or
 *   supplementary) is missing — the index is still shown, with a
 *   visible caveat.
 * - `"insufficient-data"`: none of the essential factors for this trip's
 *   actual mode(s) could be scored — there is no defensible basis for an
 *   index at all, and the UI must not display one (never fall back to
 *   `0`/"Low").
 */
export type RiskPredictionStatus = "available" | "limited-data" | "insufficient-data";

/** The result of `assessPredictionSufficiency` — kept as its own type since it's meaningful independent of the final score (e.g. useful for logging/telemetry later). */
export interface PredictionSufficiency {
  status: RiskPredictionStatus;
  /** Human-readable reasons, e.g. "Weather data unavailable" — only ever naming factors that are genuinely missing, never a generic "something went wrong." */
  reasons: string[];
  /** The applicable factors that are `"unavailable"` (excludes `"not-applicable"` ones, which were never expected to contribute). */
  missingSources: RiskFactorKey[];
}

/**
 * WinterRoute's V0 experimental commute-disruption index.
 *
 * This is NOT a probability. `overallIndex: 78` does not mean "78% chance
 * of disruption" — it means "given the currently available weather,
 * traffic, road-event, and transit evidence, this trip has relatively
 * high disruption severity under WinterRoute V0's transparent heuristic
 * model." No historical outcome data has been used to calibrate this
 * model — see docs/decisions/0008-risk-model-v0.md "No claim of
 * accuracy." Never render or describe this value as a percentage chance.
 *
 * `overallIndex`/`label` are computed unconditionally (so they're always
 * a plain bounded number, never `NaN`, for internal consistency and
 * debugging), but a caller/UI must check `predictionStatus` before
 * displaying them — see `RiskPredictionStatus`'s doc comment. When
 * `predictionStatus === "insufficient-data"`, `overallIndex`/`label`
 * must NOT be shown to the user at all.
 */
export interface ExperimentalCommuteRiskV0 {
  modelVersion: "winterroute-risk-v0";
  /** A deterministic fingerprint of `riskModelV0Config` at the time this was computed — see `lib/evaluation/configFingerprint.ts`. Lets a stored prediction be traced back to exactly which thresholds/weights produced it. */
  configFingerprint: string;
  analyzedAt: Date;
  overallIndex: number;
  label: RiskLabel;
  predictionStatus: RiskPredictionStatus;
  sufficiency: PredictionSufficiency;
  factors: Record<RiskFactorKey, FactorScore>;
  weighting: RiskFactorWeighting[];
  /** Applicable (scored) factors only, sorted descending by `weightedContribution`. */
  contributions: RiskContribution[];
  /** The top 2-3 contributors, as human-readable labels (e.g. "Traffic delay", "Snowfall"). */
  dominantFactors: string[];
  /** Deterministic, template-generated sentences — never an LLM, never random prose. */
  explanation: string[];
  dataCoverage: DataCoverage;
  /** Preserved for the dev-detail view and any future calibration work — see docs/architecture.md "Data-science preservation (risk model)." */
  features: CommuteFeatureSet;
}
