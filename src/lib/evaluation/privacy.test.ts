import { describe, expect, it } from "vitest";
import { toStorableSnapshot } from "./privacy";
import { buildTestSnapshot } from "./fixtures";

describe("toStorableSnapshot", () => {
  it("drops the exact origin/destination labels entirely", () => {
    const snapshot = buildTestSnapshot();
    const storable = toStorableSnapshot(snapshot);
    expect("originLabel" in storable.featureSnapshot).toBe(false);
    expect("destinationLabel" in storable.featureSnapshot).toBe(false);
    // A distinctive label (unlike a short word such as "Start", which would
    // false-positive-match unrelated field names like "routeStartTime") to
    // confirm the actual label value isn't smuggled in anywhere else.
    const distinctiveSnapshot = buildTestSnapshot();
    distinctiveSnapshot.featureSnapshot.originLabel = "123 Totally Unique Test Home Address";
    const redacted = toStorableSnapshot(distinctiveSnapshot);
    expect(JSON.stringify(redacted)).not.toContain("Totally Unique Test Home Address");
  });

  it("preserves route characteristics needed for evaluation grouping", () => {
    const snapshot = buildTestSnapshot();
    const storable = toStorableSnapshot(snapshot);
    expect(storable.routeCharacteristics.segmentCount).toBe(snapshot.featureSnapshot.segments.length);
    expect(storable.routeCharacteristics.modeComposition).toEqual(snapshot.tripContext.actualRouteModeComposition);
  });

  it("preserves the score, label, and prediction status", () => {
    const snapshot = buildTestSnapshot();
    const storable = toStorableSnapshot(snapshot);
    expect(storable.overallIndex).toBe(snapshot.overallIndex);
    expect(storable.label).toBe(snapshot.label);
    expect(storable.predictionStatus).toBe(snapshot.predictionStatus);
  });

  it("preserves the model version and config fingerprint for future traceability", () => {
    const snapshot = buildTestSnapshot();
    const storable = toStorableSnapshot(snapshot);
    expect(storable.modelVersion).toBe(snapshot.modelVersion);
    expect(storable.configFingerprint).toBe(snapshot.configFingerprint);
  });
});
