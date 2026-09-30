import { describe, expect, it } from "vitest";
import { buildCommuteFeatures } from "@/lib/scoring/buildFeatures";
import { route, segment, transitAnalysis } from "@/lib/scoring/fixtures";
import { buildHorizonWidening } from "./horizonWidening";

function featuresAtHorizon(hoursOut: number) {
  const start = new Date(Date.now() + hoursOut * 60 * 60 * 1000);
  const r = route([segment({ id: "s1", mode: "drive", startTime: start, endTime: new Date(start.getTime() + 30 * 60_000) })]);
  return buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "car" }), now: new Date() });
}

describe("buildHorizonWidening", () => {
  it("produces no contribution for a trip starting right now", () => {
    const contributions = buildHorizonWidening(featuresAtHorizon(0));
    expect(contributions).toEqual([]);
  });

  it("produces a negligible widening for a near-immediate trip", () => {
    const contributions = buildHorizonWidening(featuresAtHorizon(0.1));
    expect(contributions[0]?.upperMinutes ?? 0).toBeLessThan(0.1);
  });

  it("widens the upper bound more for a farther-out trip", () => {
    const near = buildHorizonWidening(featuresAtHorizon(1))[0]?.upperMinutes ?? 0;
    const far = buildHorizonWidening(featuresAtHorizon(70))[0]?.upperMinutes ?? 0;
    expect(far).toBeGreaterThan(near);
  });

  it("never shifts the central estimate", () => {
    const contribution = buildHorizonWidening(featuresAtHorizon(70))[0];
    expect(contribution?.centralMinutes).toBe(0);
  });

  it("caps the widening rather than growing unbounded", () => {
    const contribution = buildHorizonWidening(featuresAtHorizon(1000))[0];
    expect(contribution?.upperMinutes).toBeLessThanOrEqual(20);
  });
});
