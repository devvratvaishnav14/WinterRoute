import { describe, expect, it } from "vitest";
import type { RouteSegment } from "./types";
import { deriveSegmentTimes } from "./timeline";

function segment(overrides: Partial<RouteSegment> & Pick<RouteSegment, "id" | "mode">): RouteSegment {
  return {
    start: { label: "A", latitude: 0, longitude: 0 },
    end: { label: "B", latitude: 0, longitude: 0 },
    durationMinutes: 10,
    ...overrides,
  };
}

describe("deriveSegmentTimes", () => {
  it("does nothing when nothing is known and no start time is given", () => {
    const segments = [segment({ id: "a", mode: "drive" })];
    const result = deriveSegmentTimes(segments);
    expect(result[0].startTime).toBeUndefined();
    expect(result[0].endTime).toBeUndefined();
  });

  it("seeds the first segment from a known start time and computes its end", () => {
    const segments = [segment({ id: "a", mode: "drive", durationMinutes: 10 })];
    const start = new Date("2026-09-24T08:00:00Z");
    const result = deriveSegmentTimes(segments, start);

    expect(result[0].startTime).toEqual(start);
    expect(result[0].endTime).toEqual(new Date("2026-09-24T08:10:00Z"));
  });

  it("propagates a known middle segment's real times outward to its neighbors", () => {
    const segments = [
      segment({ id: "walk-1", mode: "walk", durationMinutes: 5 }),
      segment({
        id: "bus",
        mode: "bus",
        durationMinutes: 20,
        startTime: new Date("2026-09-24T08:10:00Z"),
        endTime: new Date("2026-09-24T08:30:00Z"),
      }),
      segment({ id: "walk-2", mode: "walk", durationMinutes: 4 }),
    ];

    const result = deriveSegmentTimes(segments);

    // First walk has no known start, but its end is derived backward from
    // the bus's real departure time.
    expect(result[0].endTime).toEqual(new Date("2026-09-24T08:10:00Z"));
    expect(result[0].startTime).toEqual(new Date("2026-09-24T08:05:00Z"));

    // Last walk starts exactly when the bus arrives.
    expect(result[2].startTime).toEqual(new Date("2026-09-24T08:30:00Z"));
    expect(result[2].endTime).toEqual(new Date("2026-09-24T08:34:00Z"));
  });

  it("does not overwrite a segment's own already-known times", () => {
    const known = new Date("2026-09-24T08:10:00Z");
    const segments = [segment({ id: "bus", mode: "bus", startTime: known, durationMinutes: 20 })];
    const result = deriveSegmentTimes(segments, new Date("2026-09-24T09:00:00Z"));
    expect(result[0].startTime).toEqual(known);
  });
});
