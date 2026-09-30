import { describe, expect, it } from "vitest";
import { buildTestSnapshot } from "./fixtures";

describe("createPredictionSnapshot", () => {
  it("preserves the model version and config fingerprint from the computed risk", () => {
    const snapshot = buildTestSnapshot();
    expect(snapshot.modelVersion).toBe("winterroute-risk-v0");
    expect(snapshot.configFingerprint).toMatch(/^[0-9a-f]+$/);
  });

  it("preserves the full engineered feature snapshot, not a summary", () => {
    const snapshot = buildTestSnapshot();
    expect(snapshot.featureSnapshot.segments).toHaveLength(1);
    expect(snapshot.featureSnapshot.weather.availability).toBe("complete");
  });

  it("preserves trip context not derivable from the risk result alone", () => {
    const snapshot = buildTestSnapshot({ requestedMode: "car", timePreference: "leaveAt" });
    expect(snapshot.tripContext.requestedMode).toBe("car");
    expect(snapshot.tripContext.timePreference).toBe("leaveAt");
  });

  it("preserves the real segment-mode composition, not just the requested mode", () => {
    const snapshot = buildTestSnapshot();
    expect(snapshot.tripContext.actualRouteModeComposition[0].mode).toBe("drive");
  });

  it("lists the providers actually consulted", () => {
    const snapshot = buildTestSnapshot();
    expect(snapshot.providersUsed).toEqual(expect.arrayContaining(["open-meteo", "google-routes"]));
  });

  it("generates a unique predictionId when none is supplied", () => {
    const a = buildTestSnapshot({ predictionId: undefined });
    const b = buildTestSnapshot({ predictionId: undefined });
    expect(a.predictionId).not.toBe(b.predictionId);
  });

  it("contains no field whose name suggests a secret/key/token", () => {
    const snapshot = buildTestSnapshot();
    const json = JSON.stringify(snapshot);
    expect(json.toLowerCase()).not.toMatch(/apikey|api_key|secret|password|"token"/);
  });
});
