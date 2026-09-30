import type { PredictionSnapshot, StorablePredictionSnapshot } from "./types";

/**
 * Converts a live, in-memory `PredictionSnapshot` (full location labels,
 * used only for the current request/session) into the privacy-conscious
 * shape a FUTURE persistence layer should actually store.
 *
 * `CommuteFeatureSet` already carries no raw coordinates anywhere — that
 * was a property of the feature-engineering design from the previous
 * stage, not something added here. The only genuinely identifying fields
 * left are the two location LABELS (`originLabel`/`destinationLabel`),
 * which could be an exact typed-in home address — those are dropped
 * entirely in favor of `routeCharacteristics` (distance, duration,
 * segment/mode composition), which is everything a future evaluation
 * actually needs to group and compare predictions without knowing where
 * someone travelled. See docs/decisions/0009-v0-hardening-and-evaluation-design.md
 * "Privacy-mindful design."
 *
 * This does NOT touch anything in the live, functioning routing system —
 * `ResolvedLocation` and the rest of the app still use exact coordinates,
 * as routing requires. This transform only applies to the future
 * evaluation-storage boundary.
 */
export function toStorableSnapshot(snapshot: PredictionSnapshot): StorablePredictionSnapshot {
  // Built via explicit inclusion (not destructuring-exclusion) so it's
  // obvious at a glance that `originLabel`/`destinationLabel` are never
  // copied in, rather than relying on remembering to omit them.
  const { weather, traffic, roadEvents, transit, temporal, segments, totalDistanceMeters, dataCoverage } =
    snapshot.featureSnapshot;
  const storableFeatures = { weather, traffic, roadEvents, transit, temporal, segments, totalDistanceMeters, dataCoverage };

  return {
    predictionId: snapshot.predictionId,
    modelVersion: snapshot.modelVersion,
    configFingerprint: snapshot.configFingerprint,
    createdAt: snapshot.createdAt,
    routeCharacteristics: {
      totalDistanceMeters: snapshot.tripContext.totalDistanceMeters,
      segmentCount: snapshot.featureSnapshot.segments.length,
      modeComposition: snapshot.tripContext.actualRouteModeComposition,
      baselineDurationMinutes: snapshot.tripContext.baselineDurationMinutes,
    },
    requestedMode: snapshot.tripContext.requestedMode,
    timePreference: snapshot.tripContext.timePreference,
    selectedTripTime: snapshot.tripContext.selectedTripTime,
    forecastHorizonHours: snapshot.tripContext.forecastHorizonHours,
    featureSnapshot: storableFeatures,
    factorScores: snapshot.factorScores,
    overallIndex: snapshot.overallIndex,
    label: snapshot.label,
    predictionStatus: snapshot.predictionStatus,
    dataCoverage: snapshot.dataCoverage,
    durationPrediction: snapshot.durationPrediction,
    timingRecommendation: snapshot.timingRecommendation,
  };
}
