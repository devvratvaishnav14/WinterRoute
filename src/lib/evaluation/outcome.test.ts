import { describe, expect, it } from "vitest";
import { assessOutcomeCompleteness, createCommuteOutcome } from "./outcome";

describe("assessOutcomeCompleteness", () => {
  it("is 'none' when no optional field is present", () => {
    expect(
      assessOutcomeCompleteness({ predictionId: "p1", observationCreatedAt: new Date() }),
    ).toBe("none");
  });

  it("is 'partial' when only some fields are known (missing actual duration allowed)", () => {
    const completeness = assessOutcomeCompleteness({
      predictionId: "p1",
      observationCreatedAt: new Date(),
      actualDepartureTime: { value: new Date(), provenance: "user-reported" },
      // actualDurationMinutes intentionally omitted — unknown, not defaulted.
    });
    expect(completeness).toBe("partial");
  });
});

describe("createCommuteOutcome", () => {
  it("preserves provenance alongside each value", () => {
    const outcome = createCommuteOutcome({
      predictionId: "p1",
      observationCreatedAt: new Date(),
      actualArrivalTime: { value: new Date("2026-09-24T15:51:00Z"), provenance: "user-reported" },
      observedWeather: { value: { temperatureC: 2 }, provenance: "provider-observed" },
    });
    expect(outcome.actualArrivalTime?.provenance).toBe("user-reported");
    expect(outcome.observedWeather?.provenance).toBe("provider-observed");
  });

  it("allows a partial outcome with most fields genuinely missing", () => {
    const outcome = createCommuteOutcome({
      predictionId: "p1",
      observationCreatedAt: new Date(),
      transitCancellationObserved: { value: true, provenance: "provider-observed" },
    });
    expect(outcome.actualDurationMinutes).toBeUndefined();
    expect(outcome.actualArrivalTime).toBeUndefined();
    expect(outcome.outcomeCompleteness).toBe("partial");
  });

  it("never fabricates a value for a field that wasn't supplied", () => {
    const outcome = createCommuteOutcome({ predictionId: "p1", observationCreatedAt: new Date() });
    expect(outcome.actualDurationMinutes).toBeUndefined();
    expect(outcome.outcomeCompleteness).toBe("none");
  });
});
