import { describe, expect, it } from "vitest";
import type { RouteSegment } from "@/lib/route/types";
import {
  MAX_SAMPLE_POINTS,
  MIN_SEGMENT_DISTANCE_FOR_INTERMEDIATE_SAMPLES_METERS,
  buildRouteWeatherSamples,
} from "./sampling";

function loc(label: string, latitude: number, longitude: number) {
  return { label, latitude, longitude };
}

describe("buildRouteWeatherSamples", () => {
  it("returns [] for no segments", () => {
    expect(buildRouteWeatherSamples([])).toEqual([]);
  });

  it("retains the origin and destination for a short single-segment route", () => {
    const start = new Date("2026-09-24T16:00:00Z");
    const end = new Date("2026-09-24T16:05:00Z");
    const segments: RouteSegment[] = [
      {
        id: "walk-1",
        mode: "walk",
        start: loc("SFU Burnaby", 49.2781, -122.9199),
        end: loc("SFU Transportation Centre", 49.28, -122.9201),
        startTime: start,
        endTime: end,
        durationMinutes: 5,
        distanceMeters: 338,
      },
    ];

    const samples = buildRouteWeatherSamples(segments);

    expect(samples).toHaveLength(2);
    expect(samples[0].label).toBe("SFU Burnaby");
    expect(samples[0].estimatedTime).toEqual(start);
    expect(samples[1].label).toBe("SFU Transportation Centre");
    expect(samples[1].estimatedTime).toEqual(end);
  });

  it("does not add intermediate samples for a short route (below the distance threshold)", () => {
    const segments: RouteSegment[] = [
      {
        id: "walk-1",
        mode: "walk",
        start: loc("A", 49.28, -122.92),
        end: loc("B", 49.2805, -122.9205),
        startTime: new Date("2026-09-24T16:00:00Z"),
        endTime: new Date("2026-09-24T16:05:00Z"),
        distanceMeters: MIN_SEGMENT_DISTANCE_FOR_INTERMEDIATE_SAMPLES_METERS - 1,
      },
    ];
    expect(buildRouteWeatherSamples(segments)).toHaveLength(2);
  });

  it("adds intermediate samples along a long segment", () => {
    const start = new Date("2026-09-24T16:00:00Z");
    const end = new Date("2026-09-24T16:36:00Z");
    const segments: RouteSegment[] = [
      {
        id: "drive-1",
        mode: "drive",
        start: loc("SFU Burnaby", 49.2781, -122.9199),
        end: loc("Downtown Vancouver", 49.2827, -123.1207),
        startTime: start,
        endTime: end,
        durationMinutes: 36,
        distanceMeters: 18554,
      },
    ];

    const samples = buildRouteWeatherSamples(segments);

    expect(samples.length).toBeGreaterThan(2);
    expect(samples[0].label).toBe("SFU Burnaby");
    expect(samples[samples.length - 1].label).toBe("Downtown Vancouver");
    // Every intermediate sample's time is strictly between the segment's bounds.
    for (const sample of samples.slice(1, -1)) {
      expect(sample.estimatedTime.getTime()).toBeGreaterThan(start.getTime());
      expect(sample.estimatedTime.getTime()).toBeLessThan(end.getTime());
    }
  });

  it("never exceeds MAX_SAMPLE_POINTS even for a very long route", () => {
    const start = new Date("2026-09-24T16:00:00Z");
    const end = new Date("2026-09-24T19:00:00Z");
    const segments: RouteSegment[] = [
      {
        id: "drive-1",
        mode: "drive",
        start: loc("A", 49.0, -123.0),
        end: loc("B", 50.0, -121.0),
        startTime: start,
        endTime: end,
        durationMinutes: 180,
        distanceMeters: 200_000,
      },
    ];
    const samples = buildRouteWeatherSamples(segments);
    expect(samples.length).toBeLessThanOrEqual(MAX_SAMPLE_POINTS);
  });

  it("retains every segment boundary for a multi-segment (walk -> bus -> walk) route, in order", () => {
    const segments: RouteSegment[] = [
      {
        id: "walk-1",
        mode: "walk",
        start: loc("SFU Burnaby", 49.2781, -122.9199),
        end: loc("SFU Transportation Centre", 49.28, -122.9201),
        startTime: new Date("2026-09-24T16:00:00Z"),
        endTime: new Date("2026-09-24T16:05:00Z"),
        distanceMeters: 334,
      },
      {
        id: "bus-1",
        mode: "bus",
        start: loc("SFU Transportation Centre", 49.28, -122.9201),
        end: loc("Burrard Station", 49.2862, -123.1183),
        startTime: new Date("2026-09-24T16:09:00Z"),
        endTime: new Date("2026-09-24T17:06:00Z"),
        durationMinutes: 57,
        distanceMeters: 16525,
      },
      {
        id: "walk-2",
        mode: "walk",
        start: loc("Burrard Station", 49.2862, -123.1183),
        end: loc("Downtown Vancouver", 49.2827, -123.1207),
        startTime: new Date("2026-09-24T17:06:00Z"),
        endTime: new Date("2026-09-24T17:15:00Z"),
        distanceMeters: 614,
      },
    ];

    const samples = buildRouteWeatherSamples(segments);
    const labels = samples.map((s) => s.label);

    expect(labels[0]).toBe("SFU Burnaby");
    expect(labels).toContain("SFU Transportation Centre");
    expect(labels).toContain("Burrard Station");
    expect(labels[labels.length - 1]).toBe("Downtown Vancouver");

    // No duplicate boundary between segments (bus's start === walk-1's end).
    expect(labels.filter((l) => l === "SFU Transportation Centre")).toHaveLength(1);
  });

  it("produces sample times that progress monotonically through the journey", () => {
    const segments: RouteSegment[] = [
      {
        id: "drive-1",
        mode: "drive",
        start: loc("SFU Burnaby", 49.2781, -122.9199),
        end: loc("Surrey Central", 49.1913, -122.849),
        startTime: new Date("2026-09-24T16:00:00Z"),
        endTime: new Date("2026-09-24T16:40:00Z"),
        durationMinutes: 40,
        distanceMeters: 20000,
      },
    ];

    const samples = buildRouteWeatherSamples(segments);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].estimatedTime.getTime()).toBeGreaterThanOrEqual(
        samples[i - 1].estimatedTime.getTime(),
      );
    }
  });

  it("drops a boundary with no derivable time rather than producing an undefined time", () => {
    const segments: RouteSegment[] = [
      {
        id: "drive-1",
        mode: "drive",
        start: loc("A", 49.0, -123.0),
        end: loc("B", 49.1, -123.1),
        // No startTime/endTime at all — e.g. non-transit Arrive By with no
        // baseline duration to derive a nominal timeline from.
      },
    ];
    expect(buildRouteWeatherSamples(segments)).toEqual([]);
  });
});
