import { describe, expect, it } from "vitest";
import type { DelayContribution } from "./types";
import { buildDurationExplanation, buildDurationNotes, isInformationalContribution, isUserFacingDelayContribution } from "./explanation";

function contribution(overrides: Partial<DelayContribution> = {}): DelayContribution {
  return {
    key: "test",
    label: "Test",
    centralMinutes: 0,
    lowerMinutes: 0,
    upperMinutes: 0,
    provenance: "heuristic-v0",
    explanation: "Test explanation.",
    appliesTo: "route",
    ...overrides,
  };
}

describe("isUserFacingDelayContribution", () => {
  it("excludes a zero-effect contribution", () => {
    expect(isUserFacingDelayContribution(contribution({ centralMinutes: 0, upperMinutes: 0 }))).toBe(false);
  });

  it("excludes forecast-horizon widening even when non-zero", () => {
    expect(isUserFacingDelayContribution(contribution({ key: "forecastHorizon", upperMinutes: 5 }))).toBe(false);
  });

  it("includes a genuine non-zero contribution", () => {
    expect(isUserFacingDelayContribution(contribution({ key: "carTrafficTiming", upperMinutes: 8 }))).toBe(true);
  });
});

describe("isInformationalContribution", () => {
  it("classifies a schedule-only transit contribution as informational", () => {
    expect(isInformationalContribution(contribution({ key: "transitScheduleOnly-seg1" }))).toBe(true);
  });

  it("classifies a no-traffic-data contribution as informational", () => {
    expect(isInformationalContribution(contribution({ key: "carNoTrafficData" }))).toBe(true);
  });

  it("does not classify a real transit service alert as informational — an active alert is a genuine reason", () => {
    expect(isInformationalContribution(contribution({ key: "transitAlert-seg1" }))).toBe(false);
  });

  it("does not classify a road event as informational — a real event is a genuine reason", () => {
    expect(isInformationalContribution(contribution({ key: "roadEventUncertainty" }))).toBe(false);
  });

  it("does not classify observed traffic delay as informational", () => {
    expect(isInformationalContribution(contribution({ key: "carTrafficTiming" }))).toBe(false);
  });
});

describe("buildDurationExplanation / buildDurationNotes", () => {
  it("puts a genuine disruption reason in explanation, not notes", () => {
    const contributions = [contribution({ key: "carTrafficTiming", upperMinutes: 8, explanation: "Traffic is adding time." })];
    expect(buildDurationExplanation(contributions)).toEqual(["Traffic is adding time."]);
    expect(buildDurationNotes(contributions)).toEqual([]);
  });

  it("puts an uncertainty note in notes, not explanation", () => {
    const contributions = [
      contribution({ key: "transitScheduleOnly-seg1", upperMinutes: 3, explanation: "Bus 145 has no realtime update yet." }),
    ];
    expect(buildDurationExplanation(contributions)).toEqual([]);
    expect(buildDurationNotes(contributions)).toEqual(["Bus 145 has no realtime update yet."]);
  });

  it("separates a real reason and a note from the same contribution list", () => {
    const contributions = [
      contribution({ key: "carTrafficTiming", upperMinutes: 8, explanation: "Traffic is adding time." }),
      contribution({ key: "transitScheduleOnly-seg1", upperMinutes: 3, explanation: "Bus 145 has no realtime update yet." }),
    ];
    expect(buildDurationExplanation(contributions)).toEqual(["Traffic is adding time."]);
    expect(buildDurationNotes(contributions)).toEqual(["Bus 145 has no realtime update yet."]);
  });

  it("excludes forecast-horizon widening from both explanation and notes", () => {
    const contributions = [contribution({ key: "forecastHorizon", upperMinutes: 5, explanation: "This trip is 2 hours out." })];
    expect(buildDurationExplanation(contributions)).toEqual([]);
    expect(buildDurationNotes(contributions)).toEqual([]);
  });
});
