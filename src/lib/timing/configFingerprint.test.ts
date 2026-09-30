import { describe, expect, it } from "vitest";
import { computeTimingConfigFingerprint } from "./configFingerprint";
import { computeConfigFingerprint } from "@/lib/scoring/configFingerprint";
import { computeDurationConfigFingerprint } from "@/lib/duration/configFingerprint";

describe("computeTimingConfigFingerprint", () => {
  it("is stable across repeated calls", () => {
    expect(computeTimingConfigFingerprint()).toBe(computeTimingConfigFingerprint());
  });

  it("is a hex string", () => {
    expect(computeTimingConfigFingerprint()).toMatch(/^[0-9a-f]+$/);
  });

  it("is independent from the risk and duration models' fingerprints", () => {
    const timing = computeTimingConfigFingerprint();
    const risk = computeConfigFingerprint();
    const duration = computeDurationConfigFingerprint();
    expect(timing).not.toBe(risk);
    expect(timing).not.toBe(duration);
  });
});
