import { describe, expect, it } from "vitest";
import { deserializeSnapshot, serializeSnapshot } from "./serialization";
import { buildTestSnapshot } from "./fixtures";

describe("serializeSnapshot / deserializeSnapshot", () => {
  it("round-trips every Date field back into a real Date instance", () => {
    const snapshot = buildTestSnapshot();
    const revived = deserializeSnapshot(serializeSnapshot(snapshot));

    expect(revived.createdAt).toBeInstanceOf(Date);
    expect(revived.createdAt.getTime()).toBe(snapshot.createdAt.getTime());
    expect(revived.tripContext.selectedTripTime).toBeInstanceOf(Date);
    expect(revived.tripContext.selectedTripTime.getTime()).toBe(snapshot.tripContext.selectedTripTime.getTime());
  });

  it("round-trips optional route start/end times when present", () => {
    const snapshot = buildTestSnapshot();
    const revived = deserializeSnapshot(serializeSnapshot(snapshot));
    if (snapshot.tripContext.routeStartTime) {
      expect(revived.tripContext.routeStartTime).toBeInstanceOf(Date);
      expect(revived.tripContext.routeStartTime?.getTime()).toBe(snapshot.tripContext.routeStartTime.getTime());
    }
  });

  it("preserves non-date feature values exactly", () => {
    const snapshot = buildTestSnapshot();
    const revived = deserializeSnapshot(serializeSnapshot(snapshot));
    expect(revived.overallIndex).toBe(snapshot.overallIndex);
    expect(revived.label).toBe(snapshot.label);
    expect(revived.factorScores).toEqual(snapshot.factorScores);
    expect(revived.featureSnapshot.segments).toEqual(snapshot.featureSnapshot.segments);
  });

  it("preserves predictionStatus and sufficiency reasons", () => {
    const snapshot = buildTestSnapshot();
    const revived = deserializeSnapshot(serializeSnapshot(snapshot));
    expect(revived.predictionStatus).toBe(snapshot.predictionStatus);
    expect(revived.sufficiency).toEqual(snapshot.sufficiency);
  });

  it("produces valid JSON text", () => {
    const snapshot = buildTestSnapshot();
    expect(() => JSON.parse(serializeSnapshot(snapshot))).not.toThrow();
  });
});
