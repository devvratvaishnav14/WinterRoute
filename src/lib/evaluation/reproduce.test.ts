import { describe, expect, it } from "vitest";
import { checkReproducibility, reevaluateSnapshot } from "./reproduce";
import { buildTestSnapshot } from "./fixtures";

describe("reevaluateSnapshot", () => {
  it("re-scores the stored feature snapshot without needing the original route/weather/traffic/transit data", () => {
    const snapshot = buildTestSnapshot();
    const reevaluated = reevaluateSnapshot(snapshot);
    expect(reevaluated.overallIndex).toBe(snapshot.overallIndex);
    expect(reevaluated.label).toBe(snapshot.label);
    expect(reevaluated.factors).toEqual(snapshot.factorScores);
  });

  it("is deterministic: re-running it twice produces identical results", () => {
    const snapshot = buildTestSnapshot();
    const first = reevaluateSnapshot(snapshot);
    const second = reevaluateSnapshot(snapshot);
    expect(first.overallIndex).toBe(second.overallIndex);
    expect(first.label).toBe(second.label);
  });
});

describe("checkReproducibility", () => {
  it("reports the current config as unchanged and the score as reproduced for a freshly-built snapshot", () => {
    const snapshot = buildTestSnapshot();
    const check = checkReproducibility(snapshot);
    expect(check.configUnchanged).toBe(true);
    expect(check.reproducesOriginal).toBe(true);
  });

  it("distinguishes a snapshot from a different model version/config fingerprint", () => {
    const snapshot = buildTestSnapshot();
    const staleSnapshot = { ...snapshot, configFingerprint: "0000dead" };
    const check = checkReproducibility(staleSnapshot);
    // The stored fingerprint no longer matches the currently-running config...
    expect(check.configUnchanged).toBe(false);
    // ...but re-scoring the SAME feature data with today's logic is still perfectly reproducible on its own terms.
    expect(check.reproducesOriginal).toBe(true);
  });
});
