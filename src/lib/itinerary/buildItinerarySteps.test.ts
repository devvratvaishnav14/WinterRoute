import { describe, expect, it } from "vitest";
import { route, segment, trafficAnalysis, trafficResult, transitAnalysis, transitSegmentAnalysis } from "@/lib/scoring/fixtures";
import type { TrafficPreviewState } from "@/components/trip/TrafficPreview";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";
import { buildItinerarySteps } from "./buildItinerarySteps";

function walk(id: string, endLabel = "Destination"): ReturnType<typeof segment> {
  return segment({ id, mode: "walk", durationMinutes: 4, distanceMeters: 300, end: { label: endLabel, latitude: 49.28, longitude: -123.1 } });
}

function bus(id: string, overrides: Parameters<typeof segment>[0] = {}): ReturnType<typeof segment> {
  return segment({ id, mode: "bus", ...overrides });
}

describe("buildItinerarySteps", () => {
  it("Walk -> Bus: the first walk is plain 'Walk', not 'Transfer'", () => {
    const r = route([walk("w1"), bus("b1")]);
    const steps = buildItinerarySteps(r, null, null);
    expect(steps[0].title).toBe("Walk");
    expect(steps[0].isTransfer).toBe(false);
  });

  it("Walk -> Bus -> Rail -> Walk: the middle walk between two transit legs is a Transfer", () => {
    const r = route([walk("w1"), bus("b1"), walk("w2"), segment({ id: "r1", mode: "rail" }), walk("w3")]);
    const steps = buildItinerarySteps(r, null, null);
    const middleWalk = steps.find((s) => s.id === "w2")!;
    expect(middleWalk.title).toBe("Transfer");
    expect(middleWalk.isTransfer).toBe(true);
    // First and last walks stay plain "Walk"
    expect(steps[0].title).toBe("Walk");
    expect(steps[steps.length - 1].title).toBe("Walk");
  });

  it("handles two bus transfers", () => {
    const r = route([walk("w1"), bus("b1"), walk("w2"), bus("b2"), walk("w3")]);
    const steps = buildItinerarySteps(r, null, null);
    expect(steps.filter((s) => s.mode === "bus")).toHaveLength(2);
    expect(steps.find((s) => s.id === "w2")?.isTransfer).toBe(true);
  });

  it("shows the boarding and alighting stop from the matched transit segment", () => {
    const r = route([bus("b1", { transitLine: { shortName: "145", longName: "", headsign: "Production Way", agencyName: "TransLink" } })]);
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({
        transitSegments: [
          transitSegmentAnalysis({
            routeSegmentId: "b1",
            originStop: { providerStopId: "1", name: "SFU Transportation Centre", latitude: 49.28, longitude: -122.92 },
            destinationStop: { providerStopId: "2", name: "Production Way–University Station", latitude: 49.25, longitude: -122.92 },
          }),
        ],
      }),
    };
    const steps = buildItinerarySteps(r, transitState, null);
    expect(steps[0].boardStop).toBe("SFU Transportation Centre");
    expect(steps[0].alightStop).toBe("Production Way–University Station");
  });

  it("never fabricates a board/alight stop when the provider didn't supply one", () => {
    const r = route([bus("b1")]);
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", originStop: undefined, destinationStop: undefined })] }),
    };
    const steps = buildItinerarySteps(r, transitState, null);
    expect(steps[0].boardStop).toBeUndefined();
    expect(steps[0].alightStop).toBeUndefined();
  });

  it("never fabricates a headsign/direction when transitLine is absent", () => {
    const r = route([bus("b1", { transitLine: undefined })]);
    const steps = buildItinerarySteps(r, null, null);
    expect(steps[0].subtitle).toBeUndefined();
  });

  it("shows the real headsign as 'Toward X' when the provider supplied one", () => {
    const r = route([bus("b1", { transitLine: { shortName: "145", longName: "", headsign: "Production Way–University Station", agencyName: "TransLink" } })]);
    const steps = buildItinerarySteps(r, null, null);
    expect(steps[0].subtitle).toBe("Toward Production Way–University Station");
  });

  it("shows the route line number prominently as the step title", () => {
    const r = route([bus("b1", { transitLine: { shortName: "145", longName: "", headsign: "X", agencyName: "TransLink" } })]);
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", lineShortName: "145" })] }),
    };
    expect(buildItinerarySteps(r, transitState, null)[0].title).toBe("145");
  });

  it("reflects a schedule-only state", () => {
    const r = route([bus("b1")]);
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only" })] }),
    };
    const step = buildItinerarySteps(r, transitState, null)[0];
    expect(step.statusSummary).toMatch(/realtime not yet available/);
    expect(step.severity).toBe("neutral");
  });

  it("reflects a realtime delay state", () => {
    const r = route([bus("b1")]);
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({
        transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds: 700 } })],
      }),
    };
    const step = buildItinerarySteps(r, transitState, null)[0];
    expect(step.severity).toBe("warning");
  });

  it("reflects a canceled segment", () => {
    const r = route([bus("b1")]);
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({
        transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "canceled" } })],
      }),
    };
    const step = buildItinerarySteps(r, transitState, null)[0];
    expect(step.statusSummary).toBe("Canceled");
    expect(step.severity).toBe("severe");
  });

  it("never mentions bus fullness/crowding in any step field", () => {
    const r = route([walk("w1"), bus("b1", { transitLine: { shortName: "145", longName: "", headsign: "X", agencyName: "TransLink" } })]);
    const transitState: TransitPreviewState = {
      status: "success",
      analysis: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds: 60 } })] }),
    };
    const steps = buildItinerarySteps(r, transitState, null);
    const serialized = JSON.stringify(steps).toLowerCase();
    expect(/crowd|occupanc|capacity|fullness/.test(serialized)).toBe(false);
  });

  it("produces a single compact step for a pure car route, and shows traffic delay when present", () => {
    const r = route([segment({ id: "d1", mode: "drive", durationMinutes: 29, distanceMeters: 18400 })]);
    const trafficState: TrafficPreviewState = {
      status: "success",
      result: trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 8 }) } }),
    };
    const steps = buildItinerarySteps(r, null, trafficState);
    expect(steps).toHaveLength(1);
    expect(steps[0].title).toBe("Drive");
    expect(steps[0].statusSummary).toMatch(/8/);
  });

  it("produces a single compact step for a pure walking route", () => {
    const r = route([segment({ id: "w1", mode: "walk", durationMinutes: 14, distanceMeters: 1100 })]);
    const steps = buildItinerarySteps(r, null, null);
    expect(steps).toHaveLength(1);
    expect(steps[0].title).toBe("Walk");
    expect(steps[0].isTransfer).toBe(false);
  });
});
