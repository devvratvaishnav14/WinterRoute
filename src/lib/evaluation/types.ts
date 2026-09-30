import type { DelayContribution, DurationDataCoverage, DurationPredictionStatus } from "@/lib/duration/types";
import type { SegmentTransportMode } from "@/lib/route/types";
import type { TimingArrivalWindow, TimingRecommendationStatus } from "@/lib/timing/types";
import type {
  CommuteFeatureSet,
  DataCoverage,
  FactorScore,
  PredictionSufficiency,
  RiskContribution,
  RiskFactorKey,
  RiskFactorWeighting,
  RiskLabel,
  RiskPredictionStatus,
} from "@/lib/scoring/types";
import type { TimePreference, TransportMode } from "@/lib/trip/types";

/**
 * Types for WinterRoute's FUTURE prediction-evaluation dataset — the
 * structures needed to eventually compare a V0 prediction against a real
 * observed outcome. Nothing here is persisted anywhere yet (no database
 * exists — see `docs/decisions/0009-v0-hardening-and-evaluation-design.md`
 * "No database yet"); this module only defines the shape, serialization,
 * and dev-only tooling that a future persistence layer would build on.
 *
 * `PredictionSnapshot` must behave as an immutable historical record:
 * once created, it represents exactly what WinterRoute knew and computed
 * at that instant. If tomorrow's forecast changes, an OLD snapshot must
 * still read as what was predicted THEN — never mutated to reflect newer
 * data. Nothing in this module mutates a snapshot after creation; each
 * function here takes one and returns a new value.
 */

// ---------------------------------------------------------------------------
// PredictionSnapshot
// ---------------------------------------------------------------------------

export interface PredictionSnapshotTripContext {
  originLabel: string;
  destinationLabel: string;
  requestedMode: TransportMode;
  timePreference: TimePreference;
  /** The commute time the user actually selected (leave-at or arrive-by target), not the analysis instant. */
  selectedTripTime: Date;
  routeStartTime?: Date;
  routeEndTime?: Date;
  baselineDurationMinutes?: number;
  totalDistanceMeters?: number;
  /** Hours between `createdAt` and `routeStartTime` — preserved explicitly since it's a key axis for future horizon-specific evaluation (near-term / tomorrow / 48-72h). */
  forecastHorizonHours: number;
  /** The route's REAL segment-mode composition, not just `requestedMode` — a "Bus" request can resolve to walk+bus+rail. */
  actualRouteModeComposition: Array<{ mode: SegmentTransportMode; durationMinutes: number; durationShare: number }>;
}

/** Freshness/recency metadata for the sources behind one prediction — never a raw provider payload, just enough to know how "live" each source was. */
export interface PredictionSourceFreshness {
  weatherModelsAvailable: number;
  weatherSamplePoints: number;
  trafficRecency?: "near-term" | "future";
  transitFeedTimestamps?: {
    gtfsStaticRetrievedAt?: Date;
    tripUpdatesHeaderTime?: Date;
    vehiclePositionsHeaderTime?: Date;
    serviceAlertsHeaderTime?: Date;
  };
}

/**
 * An immutable record of what WinterRoute predicted for one trip, at one
 * instant, under one exact scoring configuration. `featureSnapshot` (the
 * full `CommuteFeatureSet`) is what makes this reproducible later without
 * refetching anything — see `reproduce.ts`. Deliberately does NOT store
 * raw Google/Open-Meteo/GTFS/DriveBC responses — only the already
 * normalized features and factor scores WinterRoute itself computed,
 * plus enough provenance/timestamps to know when/how they were produced.
 */
export interface PredictionSnapshot {
  predictionId: string;
  /** e.g. "winterroute-risk-v0" — see "Model versioning" in the ADR: a future scoring change that materially affects outputs gets a NEW model version, never a silent reinterpretation of old scores. */
  modelVersion: string;
  /** A deterministic (non-cryptographic) fingerprint of the exact `riskModelV0Config` used — see `lib/scoring/configFingerprint.ts`. */
  configFingerprint: string;
  createdAt: Date;
  tripContext: PredictionSnapshotTripContext;
  featureSnapshot: CommuteFeatureSet;
  factorScores: Record<RiskFactorKey, FactorScore>;
  weighting: RiskFactorWeighting[];
  contributions: RiskContribution[];
  overallIndex: number;
  label: RiskLabel;
  predictionStatus: RiskPredictionStatus;
  sufficiency: PredictionSufficiency;
  dataCoverage: DataCoverage;
  sourceFreshness: PredictionSourceFreshness;
  /** Which optional data providers were actually consulted for this specific prediction (e.g. `["open-meteo","eccc","google-routes","drivebc"]`) — not a full attribution string, just identifiers for later grouping/analysis. */
  providersUsed: string[];
  /**
   * The expected-commute-duration prediction for the SAME trip, when one
   * was computed alongside the risk index — optional and additive, so an
   * older snapshot (from before the duration model existed) remains a
   * valid `PredictionSnapshot` with this field simply absent, rather than
   * needing a breaking schema version bump. See "Evaluation snapshot
   * extension" in docs/decisions/0010-duration-model-v0.md.
   */
  durationPrediction?: PredictionSnapshotDurationPrediction;
  /**
   * The Arrive-By/Leave-At timing recommendation for the SAME trip, when
   * one was computed — optional and additive, same non-breaking pattern
   * as `durationPrediction`. See "Evaluation snapshot" in
   * docs/decisions/0011-timing-recommendation-v0.md.
   */
  timingRecommendation?: PredictionSnapshotTimingRecommendation;
}

/** A trimmed, snapshot-friendly view of `ExpectedCommuteDurationV0` — the full `contributingDelayFactors` are preserved (small, normalized), but `features` is NOT duplicated here since it's identical to the risk snapshot's own `featureSnapshot` (both models share the same `buildCommuteFeatures` step). */
export interface PredictionSnapshotDurationPrediction {
  modelVersion: string;
  configFingerprint: string;
  baselineDurationMinutes: number;
  centralEstimateMinutes: number;
  lowerBoundMinutes: number;
  upperBoundMinutes: number;
  directlyObservedDelayMinutes: number;
  modeledAdditionalDelayMinutes: number;
  predictionStatus: DurationPredictionStatus;
  dataCoverage: DurationDataCoverage;
  contributingDelayFactors: DelayContribution[];
}

/** A trimmed, snapshot-friendly view of `CommuteTimingRecommendationV0` — never duplicates the full duration prediction (see `durationPredictionReference` on the live type), only the timing-specific outputs. */
export interface PredictionSnapshotTimingRecommendation {
  modelVersion: string;
  configFingerprint: string;
  preference: TimePreference;
  status: TimingRecommendationStatus;
  targetOrDepartureTime: Date;
  typicalReferenceTime?: Date;
  recommendedDepartureTime?: Date;
  leaveEarlierByMinutes?: number;
  expectedArrivalWindow?: TimingArrivalWindow;
}

// ---------------------------------------------------------------------------
// Privacy-conscious storable variant (for a FUTURE persistence layer only)
// ---------------------------------------------------------------------------

/** Route shape/characteristics with no location labels or coordinates at all — everything a future evaluation needs to group/compare predictions without needing to know exactly where someone travelled. */
export interface RouteCharacteristics {
  totalDistanceMeters?: number;
  segmentCount: number;
  modeComposition: Array<{ mode: SegmentTransportMode; durationMinutes: number; durationShare: number }>;
  baselineDurationMinutes?: number;
}

/** `CommuteFeatureSet` already carries no raw coordinates — only its two location LABELS are potentially identifying (e.g. an exact typed-in address), so they're the only fields this variant removes. */
export type StorableCommuteFeatureSet = Omit<CommuteFeatureSet, "originLabel" | "destinationLabel">;

/**
 * The privacy-conscious shape a FUTURE persistence layer should store,
 * per the explicit instruction not to need someone's exact home address
 * merely to evaluate model quality. See `privacy.ts` and "Privacy
 * considerations" in the ADR. This does NOT change anything about the
 * live, functioning routing system today — `ResolvedLocation` still
 * carries exact coordinates for actual routing, as it must.
 */
export interface StorablePredictionSnapshot {
  predictionId: string;
  modelVersion: string;
  configFingerprint: string;
  createdAt: Date;
  routeCharacteristics: RouteCharacteristics;
  requestedMode: TransportMode;
  timePreference: TimePreference;
  selectedTripTime: Date;
  forecastHorizonHours: number;
  featureSnapshot: StorableCommuteFeatureSet;
  factorScores: Record<RiskFactorKey, FactorScore>;
  overallIndex: number;
  label: RiskLabel;
  predictionStatus: RiskPredictionStatus;
  dataCoverage: DataCoverage;
  /** Carried through as-is — it's no less privacy-safe than the rest of this shape (no location data of any kind). */
  durationPrediction?: PredictionSnapshotDurationPrediction;
  /** Carried through as-is — no location data. */
  timingRecommendation?: PredictionSnapshotTimingRecommendation;
}

// ---------------------------------------------------------------------------
// CommuteOutcome
// ---------------------------------------------------------------------------

/**
 * Where an observed value came from — never mixed without saying so. An
 * actual arrival time might come from a user report ("I arrived at
 * 8:51"), while an observed weather value might come from an official
 * station reading; conflating the two provenances would misrepresent how
 * reliable each field actually is.
 */
export type OutcomeProvenance = "provider-observed" | "user-reported" | "derived" | "unavailable";

export interface ProvenancedValue<T> {
  value: T;
  provenance: OutcomeProvenance;
}

/**
 * A factual record of what actually happened for one prediction —
 * entirely separate from `PredictionSnapshot`. Every field is optional;
 * an absent field means "not known," never a substituted/assumed value.
 * No user-facing survey/form exists yet to collect any of this — this
 * type only defines the shape for when one eventually does.
 */
export interface CommuteOutcome {
  predictionId: string;
  observationCreatedAt: Date;
  actualDepartureTime?: ProvenancedValue<Date>;
  actualArrivalTime?: ProvenancedValue<Date>;
  actualDurationMinutes?: ProvenancedValue<number>;
  observedDelayFromBaselineMinutes?: ProvenancedValue<number>;
  transitCancellationObserved?: ProvenancedValue<boolean>;
  transitDelaySecondsObserved?: ProvenancedValue<number>;
  majorServiceAlertActive?: ProvenancedValue<boolean>;
  relevantRoadEventActive?: ProvenancedValue<boolean>;
  observedWeather?: ProvenancedValue<{ temperatureC?: number; precipitationMm?: number; snowfallCm?: number }>;
  notes?: string;
  /** A simple, honest summary of how much of this record is actually filled in — see `assessOutcomeCompleteness`. */
  outcomeCompleteness: "complete" | "partial" | "none";
}
