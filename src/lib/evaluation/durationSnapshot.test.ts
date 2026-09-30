import { describe, expect, it } from "vitest";
import { deserializeSnapshot, serializeSnapshot } from "./serialization";
import { toStorableSnapshot } from "./privacy";
import { checkReproducibility } from "./reproduce";
import { buildTestSnapshot, buildTestSnapshotWithDuration } from "./fixtures";

describe("evaluation snapshot extension — duration prediction", () => {
  it("is absent (not a fabricated default) when no duration was computed", () => {
    const snapshot = buildTestSnapshot();
    expect(snapshot.durationPrediction).toBeUndefined();
  });

  it("preserves the duration prediction when one was computed alongside risk", () => {
    const snapshot = buildTestSnapshotWithDuration();
    expect(snapshot.durationPrediction).toBeDefined();
    expect(snapshot.durationPrediction?.modelVersion).toBe("winterroute-duration-v0");
    expect(snapshot.durationPrediction?.baselineDurationMinutes).toBe(30);
  });

  it("does not break serialization for an OLDER snapshot with no duration prediction (backward compatible)", () => {
    const snapshot = buildTestSnapshot();
    const revived = deserializeSnapshot(serializeSnapshot(snapshot));
    expect(revived.durationPrediction).toBeUndefined();
    expect(revived.overallIndex).toBe(snapshot.overallIndex);
  });

  it("round-trips a snapshot that DOES carry a duration prediction", () => {
    const snapshot = buildTestSnapshotWithDuration();
    const revived = deserializeSnapshot(serializeSnapshot(snapshot));
    expect(revived.durationPrediction).toEqual(snapshot.durationPrediction);
  });

  it("is preserved (not stripped) by the privacy-conscious storable transform, since it carries no location data", () => {
    const snapshot = buildTestSnapshotWithDuration();
    const storable = toStorableSnapshot(snapshot);
    expect(storable.durationPrediction).toEqual(snapshot.durationPrediction);
  });

  it("does not interfere with risk-model reproducibility", () => {
    const snapshot = buildTestSnapshotWithDuration();
    const check = checkReproducibility(snapshot);
    expect(check.reproducesOriginal).toBe(true);
  });
});
