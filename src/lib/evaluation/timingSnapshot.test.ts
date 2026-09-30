import { describe, expect, it } from "vitest";
import { deserializeSnapshot, serializeSnapshot } from "./serialization";
import { toStorableSnapshot } from "./privacy";
import { buildTestSnapshot, buildTestSnapshotWithDuration, buildTestSnapshotWithTiming } from "./fixtures";

describe("evaluation snapshot extension — timing recommendation", () => {
  it("is absent when no timing recommendation was computed", () => {
    expect(buildTestSnapshot().timingRecommendation).toBeUndefined();
    expect(buildTestSnapshotWithDuration().timingRecommendation).toBeUndefined();
  });

  it("preserves the timing recommendation when one was computed alongside risk/duration", () => {
    const snapshot = buildTestSnapshotWithTiming();
    expect(snapshot.timingRecommendation).toBeDefined();
    expect(snapshot.timingRecommendation?.modelVersion).toBe("winterroute-timing-v0");
    expect(snapshot.timingRecommendation?.preference).toBe("arriveBy");
    expect(snapshot.timingRecommendation?.recommendedDepartureTime).toBeInstanceOf(Date);
  });

  it("does not break serialization for an older snapshot with no timing recommendation (backward compatible)", () => {
    const snapshot = buildTestSnapshotWithDuration();
    const revived = deserializeSnapshot(serializeSnapshot(snapshot));
    expect(revived.timingRecommendation).toBeUndefined();
    expect(revived.durationPrediction).toEqual(snapshot.durationPrediction);
  });

  it("round-trips a snapshot that DOES carry a timing recommendation, reviving every Date field", () => {
    const snapshot = buildTestSnapshotWithTiming();
    const revived = deserializeSnapshot(serializeSnapshot(snapshot));
    expect(revived.timingRecommendation?.targetOrDepartureTime).toBeInstanceOf(Date);
    expect(revived.timingRecommendation?.targetOrDepartureTime.getTime()).toBe(snapshot.timingRecommendation!.targetOrDepartureTime.getTime());
    expect(revived.timingRecommendation?.recommendedDepartureTime?.getTime()).toBe(snapshot.timingRecommendation!.recommendedDepartureTime!.getTime());
    if (snapshot.timingRecommendation?.expectedArrivalWindow) {
      expect(revived.timingRecommendation?.expectedArrivalWindow?.upper).toBeInstanceOf(Date);
      expect(revived.timingRecommendation?.expectedArrivalWindow?.upper.getTime()).toBe(snapshot.timingRecommendation.expectedArrivalWindow.upper.getTime());
    }
  });

  it("is preserved by the privacy-conscious storable transform, since it carries no location data", () => {
    const snapshot = buildTestSnapshotWithTiming();
    const storable = toStorableSnapshot(snapshot);
    expect(storable.timingRecommendation?.recommendedDepartureTime?.getTime()).toBe(snapshot.timingRecommendation!.recommendedDepartureTime!.getTime());
  });
});
