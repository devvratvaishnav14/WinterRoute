import type { PredictionSnapshot } from "./types";

/**
 * Explicit, typed JSON round-trip for `PredictionSnapshot` — the same
 * "revive exactly the Date fields that exist, nothing generic" approach
 * used by `lib/client/*Client.ts` for API responses. There is no
 * persistence layer yet; this exists so a future one (or the dev export
 * utility, or a test fixture) has one correct, tested way to serialize
 * and reconstruct a snapshot rather than each caller inventing its own.
 */

type SerializedPredictionSnapshot = Omit<
  PredictionSnapshot,
  "createdAt" | "tripContext" | "featureSnapshot" | "sourceFreshness" | "timingRecommendation"
> & {
  createdAt: string;
  tripContext: Omit<PredictionSnapshot["tripContext"], "selectedTripTime" | "routeStartTime" | "routeEndTime"> & {
    selectedTripTime: string;
    routeStartTime?: string;
    routeEndTime?: string;
  };
  featureSnapshot: Omit<PredictionSnapshot["featureSnapshot"], "temporal"> & {
    temporal: Omit<PredictionSnapshot["featureSnapshot"]["temporal"], "routeStartTime" | "routeEndTime"> & {
      routeStartTime?: string;
      routeEndTime?: string;
    };
  };
  sourceFreshness: Omit<PredictionSnapshot["sourceFreshness"], "transitFeedTimestamps"> & {
    transitFeedTimestamps?: {
      gtfsStaticRetrievedAt?: string;
      tripUpdatesHeaderTime?: string;
      vehiclePositionsHeaderTime?: string;
      serviceAlertsHeaderTime?: string;
    };
  };
  timingRecommendation?: Omit<
    NonNullable<PredictionSnapshot["timingRecommendation"]>,
    "targetOrDepartureTime" | "typicalReferenceTime" | "recommendedDepartureTime" | "expectedArrivalWindow"
  > & {
    targetOrDepartureTime: string;
    typicalReferenceTime?: string;
    recommendedDepartureTime?: string;
    expectedArrivalWindow?: { lower: string; central: string; upper: string };
  };
};

function toIso(date: Date | undefined): string | undefined {
  return date ? date.toISOString() : undefined;
}

function fromIso(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

/** `PredictionSnapshot` -> a plain JSON-serializable object (still needs `JSON.stringify` to become text). */
export function toSerializable(snapshot: PredictionSnapshot): SerializedPredictionSnapshot {
  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
    tripContext: {
      ...snapshot.tripContext,
      selectedTripTime: snapshot.tripContext.selectedTripTime.toISOString(),
      routeStartTime: toIso(snapshot.tripContext.routeStartTime),
      routeEndTime: toIso(snapshot.tripContext.routeEndTime),
    },
    featureSnapshot: {
      ...snapshot.featureSnapshot,
      temporal: {
        ...snapshot.featureSnapshot.temporal,
        routeStartTime: toIso(snapshot.featureSnapshot.temporal.routeStartTime),
        routeEndTime: toIso(snapshot.featureSnapshot.temporal.routeEndTime),
      },
    },
    sourceFreshness: {
      ...snapshot.sourceFreshness,
      transitFeedTimestamps: snapshot.sourceFreshness.transitFeedTimestamps
        ? {
            gtfsStaticRetrievedAt: toIso(snapshot.sourceFreshness.transitFeedTimestamps.gtfsStaticRetrievedAt),
            tripUpdatesHeaderTime: toIso(snapshot.sourceFreshness.transitFeedTimestamps.tripUpdatesHeaderTime),
            vehiclePositionsHeaderTime: toIso(snapshot.sourceFreshness.transitFeedTimestamps.vehiclePositionsHeaderTime),
            serviceAlertsHeaderTime: toIso(snapshot.sourceFreshness.transitFeedTimestamps.serviceAlertsHeaderTime),
          }
        : undefined,
    },
    timingRecommendation: snapshot.timingRecommendation
      ? {
          ...snapshot.timingRecommendation,
          targetOrDepartureTime: snapshot.timingRecommendation.targetOrDepartureTime.toISOString(),
          typicalReferenceTime: toIso(snapshot.timingRecommendation.typicalReferenceTime),
          recommendedDepartureTime: toIso(snapshot.timingRecommendation.recommendedDepartureTime),
          expectedArrivalWindow: snapshot.timingRecommendation.expectedArrivalWindow
            ? {
                lower: snapshot.timingRecommendation.expectedArrivalWindow.lower.toISOString(),
                central: snapshot.timingRecommendation.expectedArrivalWindow.central.toISOString(),
                upper: snapshot.timingRecommendation.expectedArrivalWindow.upper.toISOString(),
              }
            : undefined,
        }
      : undefined,
  };
}

/** The reverse of `toSerializable` — reconstructs real `Date` objects. */
export function fromSerializable(raw: SerializedPredictionSnapshot): PredictionSnapshot {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    tripContext: {
      ...raw.tripContext,
      selectedTripTime: new Date(raw.tripContext.selectedTripTime),
      routeStartTime: fromIso(raw.tripContext.routeStartTime),
      routeEndTime: fromIso(raw.tripContext.routeEndTime),
    },
    featureSnapshot: {
      ...raw.featureSnapshot,
      temporal: {
        ...raw.featureSnapshot.temporal,
        routeStartTime: fromIso(raw.featureSnapshot.temporal.routeStartTime),
        routeEndTime: fromIso(raw.featureSnapshot.temporal.routeEndTime),
      },
    },
    sourceFreshness: {
      ...raw.sourceFreshness,
      transitFeedTimestamps: raw.sourceFreshness.transitFeedTimestamps
        ? {
            gtfsStaticRetrievedAt: fromIso(raw.sourceFreshness.transitFeedTimestamps.gtfsStaticRetrievedAt),
            tripUpdatesHeaderTime: fromIso(raw.sourceFreshness.transitFeedTimestamps.tripUpdatesHeaderTime),
            vehiclePositionsHeaderTime: fromIso(raw.sourceFreshness.transitFeedTimestamps.vehiclePositionsHeaderTime),
            serviceAlertsHeaderTime: fromIso(raw.sourceFreshness.transitFeedTimestamps.serviceAlertsHeaderTime),
          }
        : undefined,
    },
    timingRecommendation: raw.timingRecommendation
      ? {
          ...raw.timingRecommendation,
          targetOrDepartureTime: new Date(raw.timingRecommendation.targetOrDepartureTime),
          typicalReferenceTime: fromIso(raw.timingRecommendation.typicalReferenceTime),
          recommendedDepartureTime: fromIso(raw.timingRecommendation.recommendedDepartureTime),
          expectedArrivalWindow: raw.timingRecommendation.expectedArrivalWindow
            ? {
                lower: new Date(raw.timingRecommendation.expectedArrivalWindow.lower),
                central: new Date(raw.timingRecommendation.expectedArrivalWindow.central),
                upper: new Date(raw.timingRecommendation.expectedArrivalWindow.upper),
              }
            : undefined,
        }
      : undefined,
  };
}

export function serializeSnapshot(snapshot: PredictionSnapshot): string {
  return JSON.stringify(toSerializable(snapshot));
}

export function deserializeSnapshot(json: string): PredictionSnapshot {
  return fromSerializable(JSON.parse(json) as SerializedPredictionSnapshot);
}
