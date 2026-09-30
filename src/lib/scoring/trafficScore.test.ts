import { describe, expect, it } from "vitest";
import { buildCommuteFeatures } from "./buildFeatures";
import { scoreTrafficFactor } from "./trafficScore";
import { route, segment, trafficAnalysis, trafficResult } from "./fixtures";

function featuresWithDelay(delayMinutes: number, jamShare = 0) {
  const r = route([segment({ id: "s1", mode: "drive" })]);
  const traffic = trafficResult({
    trafficAnalysis: {
      status: "analyzed",
      analysis: trafficAnalysis({
        trafficDelayMinutes: delayMinutes,
        intervals:
          jamShare > 0
            ? [
                { startPolylineIndex: 0, endPolylineIndex: 1, condition: "normal", distanceMeters: (1 - jamShare) * 1000 },
                { startPolylineIndex: 1, endPolylineIndex: 2, condition: "trafficJam", distanceMeters: jamShare * 1000 },
              ]
            : [],
      }),
    },
  });
  return buildCommuteFeatures({ route: r, weather: null, traffic, transit: null });
}

describe("scoreTrafficFactor", () => {
  it("is 'not-applicable' for a non-drive trip", () => {
    const r = route([segment({ id: "s1", mode: "bus" })]);
    const traffic = trafficResult({ trafficAnalysis: { status: "not-applicable", reason: "bus" } });
    const features = buildCommuteFeatures({ route: r, weather: null, traffic, transit: null });
    expect(scoreTrafficFactor(features).status).toBe("not-applicable");
  });

  it("is 'unavailable' when the traffic fetch failed", () => {
    const r = route([segment({ id: "s1", mode: "drive" })]);
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: null });
    expect(scoreTrafficFactor(features).status).toBe("unavailable");
  });

  it("scores zero for no delay", () => {
    expect(scoreTrafficFactor(featuresWithDelay(0)).score).toBe(0);
  });

  it("is monotonic: more delay never scores lower (Case C direction)", () => {
    const scores = [0, 2, 5, 10, 20, 30].map((d) => scoreTrafficFactor(featuresWithDelay(d)).score!);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("scores a major delay + traffic-jam route share higher than an otherwise-identical clear-road trip", () => {
    const clear = scoreTrafficFactor(featuresWithDelay(0, 0));
    const jammed = scoreTrafficFactor(featuresWithDelay(15, 0.6));
    expect(jammed.score!).toBeGreaterThan(clear.score!);
  });

  it("treats the traffic-jam route share as a small corroborating bonus, not full independent severity (avoiding double counting)", () => {
    const delayOnly = scoreTrafficFactor(featuresWithDelay(15, 0));
    const delayPlusJam = scoreTrafficFactor(featuresWithDelay(15, 1.0));
    // The jam-share bonus should meaningfully add to, but not double, the delay-only score.
    expect(delayPlusJam.score!).toBeGreaterThan(delayOnly.score!);
    expect(delayPlusJam.score!).toBeLessThan(delayOnly.score! * 2);
  });
});
