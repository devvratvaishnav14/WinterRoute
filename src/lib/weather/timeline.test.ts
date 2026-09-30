import { describe, expect, it } from "vitest";
import type { Route } from "@/lib/route/types";
import { resolveWeatherTimeline } from "./timeline";

function loc(label: string) {
  return { label, latitude: 49.28, longitude: -122.92 };
}

describe("resolveWeatherTimeline", () => {
  it("uses the route's real times as-is when already fully timed (e.g. transit)", () => {
    const start = new Date("2026-09-24T16:10:00Z");
    const end = new Date("2026-09-24T17:00:00Z");
    const route: Route = {
      origin: loc("A"),
      destination: loc("B"),
      baselineDurationMinutes: 50,
      segments: [
        { id: "bus", mode: "bus", start: loc("A"), end: loc("B"), startTime: start, endTime: end },
      ],
    };

    const result = resolveWeatherTimeline(route, "arriveBy", new Date("2026-09-24T17:00:00Z"));

    expect(result.usedNominalBaseline).toBe(false);
    expect(result.segments[0].startTime).toEqual(start);
  });

  it("seeds a leaveAt trip from the user's chosen departure time", () => {
    const route: Route = {
      origin: loc("A"),
      destination: loc("B"),
      baselineDurationMinutes: 30,
      segments: [
        { id: "drive", mode: "drive", start: loc("A"), end: loc("B"), durationMinutes: 30 },
      ],
    };
    const leaveTime = new Date("2026-09-24T16:00:00Z");

    const result = resolveWeatherTimeline(route, "leaveAt", leaveTime);

    expect(result.usedNominalBaseline).toBe(false);
    expect(result.segments[0].startTime).toEqual(leaveTime);
    expect(result.segments[0].endTime).toEqual(new Date("2026-09-24T16:30:00Z"));
  });

  it("derives a clearly-labeled nominal baseline for a non-transit Arrive By trip", () => {
    const route: Route = {
      origin: loc("A"),
      destination: loc("B"),
      baselineDurationMinutes: 36,
      segments: [
        { id: "drive", mode: "drive", start: loc("A"), end: loc("B"), durationMinutes: 36 },
      ],
    };
    const arrivalTime = new Date("2026-09-24T17:00:00Z");

    const result = resolveWeatherTimeline(route, "arriveBy", arrivalTime);

    expect(result.usedNominalBaseline).toBe(true);
    // nominal departure = arrival - baseline duration
    expect(result.segments[0].startTime).toEqual(new Date("2026-09-24T16:24:00Z"));
    expect(result.segments[0].endTime).toEqual(arrivalTime);
  });

  it("does not mutate the original route's segments when deriving a nominal baseline", () => {
    const route: Route = {
      origin: loc("A"),
      destination: loc("B"),
      baselineDurationMinutes: 36,
      segments: [
        { id: "drive", mode: "drive", start: loc("A"), end: loc("B"), durationMinutes: 36 },
      ],
    };

    resolveWeatherTimeline(route, "arriveBy", new Date("2026-09-24T17:00:00Z"));

    expect(route.segments[0].startTime).toBeUndefined();
    expect(route.segments[0].endTime).toBeUndefined();
  });

  it("leaves segments untimed when there's no baseline duration to derive a nominal timeline from", () => {
    const route: Route = {
      origin: loc("A"),
      destination: loc("B"),
      segments: [{ id: "drive", mode: "drive", start: loc("A"), end: loc("B") }],
    };

    const result = resolveWeatherTimeline(route, "arriveBy", new Date("2026-09-24T17:00:00Z"));

    expect(result.usedNominalBaseline).toBe(false);
    expect(result.segments[0].startTime).toBeUndefined();
  });
});
