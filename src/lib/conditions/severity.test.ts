import { describe, expect, it } from "vitest";
import { roadEventSeverity, trafficDelaySeverity, transitSegmentSeverity, weatherAlertSeverity, weatherConditionSeverity } from "./severity";
import type { WeatherAlert } from "@/lib/weather/types";
import type { TransitSegmentAnalysis } from "@/lib/transit/types";

function alert(overrides: Partial<WeatherAlert> = {}): WeatherAlert {
  return { provider: "eccc", id: "a1", alertType: "warning", title: "Rainfall Warning", summary: "", ...overrides };
}

function transitSegment(overrides: Partial<TransitSegmentAnalysis> = {}): TransitSegmentAnalysis {
  return {
    routeSegmentId: "seg-1",
    mode: "bus",
    lineShortName: "145",
    status: "matched-with-realtime",
    recency: "near-term",
    match: { quality: "exact", routeId: "R1", tripId: "T1", serviceId: "S1", evidence: [] },
    relevantAlerts: [],
    ...overrides,
  };
}

describe("weatherAlertSeverity", () => {
  it("prefers the provider's own risk colour over the alert type", () => {
    expect(weatherAlertSeverity(alert({ alertType: "advisory", severityColor: "Red" }))).toBe("severe");
    expect(weatherAlertSeverity(alert({ alertType: "warning", severityColor: "Yellow" }))).toBe("notice");
  });

  it("falls back to alert type when no risk colour is available", () => {
    expect(weatherAlertSeverity(alert({ alertType: "warning", severityColor: undefined }))).toBe("severe");
    expect(weatherAlertSeverity(alert({ alertType: "watch", severityColor: undefined }))).toBe("warning");
    expect(weatherAlertSeverity(alert({ alertType: "advisory", severityColor: undefined }))).toBe("notice");
    expect(weatherAlertSeverity(alert({ alertType: "statement", severityColor: undefined }))).toBe("notice");
  });

  it("never invents severe from an unknown alert type", () => {
    expect(weatherAlertSeverity(alert({ alertType: "unknown", severityColor: undefined }))).toBe("notice");
  });
});

describe("weatherConditionSeverity", () => {
  it("reads normal/clear conditions as neutral", () => {
    expect(weatherConditionSeverity("clear")).toBe("neutral");
    expect(weatherConditionSeverity("partly-cloudy")).toBe("neutral");
    expect(weatherConditionSeverity("cloudy")).toBe("neutral");
    expect(weatherConditionSeverity("unknown")).toBe("neutral");
  });

  it("reads light/moderate precipitation as notice, not severe", () => {
    expect(weatherConditionSeverity("rain")).toBe("notice");
    expect(weatherConditionSeverity("snow")).toBe("notice");
    expect(weatherConditionSeverity("drizzle")).toBe("notice");
  });

  it("reads heavy precipitation strongly supported by the resolved scene as warning", () => {
    expect(weatherConditionSeverity("heavy-rain")).toBe("warning");
    expect(weatherConditionSeverity("heavy-snow")).toBe("warning");
    expect(weatherConditionSeverity("freezing-rain")).toBe("warning");
  });

  it("reads thunderstorm as severe", () => {
    expect(weatherConditionSeverity("thunderstorm")).toBe("severe");
  });
});

describe("transitSegmentSeverity", () => {
  it("reads a canceled trip as severe", () => {
    expect(transitSegmentSeverity(transitSegment({ realtime: { tripStatus: "canceled" } }))).toBe("severe");
  });

  it("reads a no-service alert as severe (transit cancellation-equivalent)", () => {
    expect(
      transitSegmentSeverity(
        transitSegment({
          relevantAlerts: [{ provider: "translink", id: "a1", cause: "unknown", effect: "noService", headerText: "", descriptionText: "", activePeriods: [], matchedOn: "route" }],
        }),
      ),
    ).toBe("severe");
  });

  it("reads a significant-delays alert and a skipped stop as warning", () => {
    expect(
      transitSegmentSeverity(
        transitSegment({
          relevantAlerts: [{ provider: "translink", id: "a1", cause: "unknown", effect: "significantDelays", headerText: "", descriptionText: "", activePeriods: [], matchedOn: "route" }],
        }),
      ),
    ).toBe("warning");
    expect(transitSegmentSeverity(transitSegment({ realtime: { tripStatus: "scheduled", departureStopStatus: "skipped" } }))).toBe("warning");
  });

  it("reads a genuine 10+ minute realtime delay as warning", () => {
    expect(transitSegmentSeverity(transitSegment({ realtime: { tripStatus: "scheduled", departureDelaySeconds: 700 } }))).toBe("warning");
  });

  it("reads schedule-only (no realtime) as neutral/informational, never severe", () => {
    expect(transitSegmentSeverity(transitSegment({ status: "matched-schedule-only", realtime: undefined }))).toBe("neutral");
  });

  it("reads an on-time, no-alert segment as neutral", () => {
    expect(transitSegmentSeverity(transitSegment({ realtime: { tripStatus: "scheduled", departureDelaySeconds: 20 } }))).toBe("neutral");
  });
});

describe("roadEventSeverity", () => {
  it("passes through DriveBC's own severity directly", () => {
    expect(roadEventSeverity("major")).toBe("severe");
    expect(roadEventSeverity("moderate")).toBe("warning");
    expect(roadEventSeverity("minor")).toBe("notice");
  });

  it("treats unknown severity conservatively (notice), never invented severe", () => {
    expect(roadEventSeverity("unknown")).toBe("notice");
  });
});

describe("trafficDelaySeverity", () => {
  it("reads no delay as neutral", () => {
    expect(trafficDelaySeverity(0)).toBe("neutral");
  });

  it("reads a modest delay as notice", () => {
    expect(trafficDelaySeverity(5)).toBe("notice");
  });

  it("caps ordinary congestion at warning, never severe", () => {
    expect(trafficDelaySeverity(25)).toBe("warning");
  });
});
