import { describe, expect, it } from "vitest";
import { buildCommuteFeatures } from "./buildFeatures";
import { scoreTransitFactor } from "./transitScore";
import { route, segment, transitAnalysis, transitSegmentAnalysis } from "./fixtures";

function featuresWithSegment(overrides: Partial<ReturnType<typeof transitSegmentAnalysis>>) {
  const r = route([segment({ id: "s1", mode: "bus" })]);
  const transit = transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", ...overrides })] });
  return buildCommuteFeatures({ route: r, weather: null, traffic: null, transit });
}

describe("scoreTransitFactor", () => {
  it("is 'not-applicable' for a route with no transit segments", () => {
    const r = route([segment({ id: "s1", mode: "walk" })]);
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "not-applicable", reason: "no transit segments" }) });
    expect(scoreTransitFactor(features).status).toBe("not-applicable");
  });

  it("is 'unavailable' when TransLink data couldn't be fetched", () => {
    const r = route([segment({ id: "s1", mode: "bus" })]);
    const features = buildCommuteFeatures({ route: r, weather: null, traffic: null, transit: transitAnalysis({ status: "unavailable" }) });
    expect(scoreTransitFactor(features).status).toBe("unavailable");
  });

  it("scores zero for a schedule-only match with no disruption evidence", () => {
    const result = scoreTransitFactor(featuresWithSegment({ status: "matched-schedule-only" }));
    expect(result.score).toBe(0);
  });

  it("is monotonic: a larger realtime delay never scores lower", () => {
    const scores = [0, 60, 300, 600, 900].map(
      (departureDelaySeconds) =>
        scoreTransitFactor(
          featuresWithSegment({ status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds } }),
        ).score!,
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("scores a canceled matched trip substantially higher than an identical on-time case (Case D)", () => {
    const onTime = scoreTransitFactor(
      featuresWithSegment({ status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds: 0 } }),
    );
    const canceled = scoreTransitFactor(
      featuresWithSegment({ status: "matched-with-realtime", realtime: { tripStatus: "canceled" } }),
    );
    expect(canceled.score!).toBeGreaterThan(onTime.score! + 40);
  });

  it("floors the score at the cancellation severity even when other signals are minor", () => {
    const result = scoreTransitFactor(
      featuresWithSegment({ status: "matched-with-realtime", realtime: { tripStatus: "canceled", departureDelaySeconds: 30 } }),
    );
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it("weighs a NO_SERVICE-equivalent alert far more than a minor informational one", () => {
    const major = scoreTransitFactor(
      featuresWithSegment({
        status: "matched-schedule-only",
        relevantAlerts: [{ provider: "translink", id: "a1", cause: "unknown", effect: "noService", headerText: "", descriptionText: "", activePeriods: [], matchedOn: "route" }],
      }),
    );
    const minor = scoreTransitFactor(
      featuresWithSegment({
        status: "matched-schedule-only",
        relevantAlerts: [{ provider: "translink", id: "a2", cause: "unknown", effect: "otherEffect", headerText: "", descriptionText: "", activePeriods: [], matchedOn: "route" }],
      }),
    );
    expect(major.score!).toBeGreaterThan(minor.score!);
  });

  it("does not treat a skipped stop as equivalent to a full cancellation", () => {
    const skipped = scoreTransitFactor(
      featuresWithSegment({ status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureStopStatus: "skipped" } }),
    );
    const canceled = scoreTransitFactor(featuresWithSegment({ status: "matched-with-realtime", realtime: { tripStatus: "canceled" } }));
    expect(skipped.score!).toBeLessThan(canceled.score!);
  });
});
