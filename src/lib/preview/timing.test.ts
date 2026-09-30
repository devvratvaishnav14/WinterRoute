import { describe, expect, it } from "vitest";
import { route, segment } from "@/lib/scoring/fixtures";
import { buildPreviewSchedule, totalPreviewDurationMs } from "./timing";

describe("buildPreviewSchedule", () => {
  it("returns an empty schedule for a route with no segments", () => {
    expect(buildPreviewSchedule(route([]))).toEqual([]);
  });

  it("gives a single-segment route the full compressed duration", () => {
    const r = route([segment({ mode: "walk", durationMinutes: 8 })]);
    const schedule = buildPreviewSchedule(r);
    expect(schedule).toHaveLength(1);
    expect(schedule[0].startMs).toBe(0);
    expect(totalPreviewDurationMs(schedule)).toBeGreaterThanOrEqual(6000);
    expect(totalPreviewDurationMs(schedule)).toBeLessThanOrEqual(15000);
  });

  it("gives the longer real segment (by duration) the larger share of the compressed preview", () => {
    const r = route([
      segment({ id: "walk1", mode: "walk", durationMinutes: 5 }),
      segment({ id: "bus1", mode: "bus", durationMinutes: 35 }),
      segment({ id: "rail1", mode: "rail", durationMinutes: 15 }),
      segment({ id: "walk2", mode: "walk", durationMinutes: 5 }),
    ]);
    const schedule = buildPreviewSchedule(r);
    const share = (id: string) => {
      const s = schedule.find((s) => s.segmentId === id)!;
      return s.endMs - s.startMs;
    };
    expect(share("bus1")).toBeGreaterThan(share("rail1"));
    expect(share("rail1")).toBeGreaterThan(share("walk1"));
    expect(share("walk1")).toBeCloseTo(share("walk2"), -1);
  });

  it("keeps segments contiguous and in route order — no gaps, no overlaps", () => {
    const r = route([
      segment({ id: "a", mode: "walk", durationMinutes: 5 }),
      segment({ id: "b", mode: "bus", durationMinutes: 20 }),
      segment({ id: "c", mode: "walk", durationMinutes: 3 }),
    ]);
    const schedule = buildPreviewSchedule(r);
    expect(schedule[0].startMs).toBe(0);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].startMs).toBe(schedule[i - 1].endMs);
    }
  });

  it("gives every segment a real, non-zero duration — a tiny transfer still stays visible", () => {
    const r = route([
      segment({ id: "a", mode: "bus", durationMinutes: 40 }),
      segment({ id: "transfer", mode: "walk", durationMinutes: 0.5 }),
      segment({ id: "c", mode: "rail", durationMinutes: 40 }),
    ]);
    const schedule = buildPreviewSchedule(r);
    for (const s of schedule) {
      expect(s.endMs - s.startMs).toBeGreaterThan(0);
    }
  });

  it("keeps a very long (90-minute) real commute within the same compressed total as a short one — no waiting a full minute", () => {
    const longRoute = route([
      segment({ id: "a", mode: "walk", durationMinutes: 5 }),
      segment({ id: "b", mode: "bus", durationMinutes: 50 }),
      segment({ id: "c", mode: "rail", durationMinutes: 30 }),
      segment({ id: "d", mode: "walk", durationMinutes: 5 }),
    ]);
    const total = totalPreviewDurationMs(buildPreviewSchedule(longRoute));
    expect(total).toBeLessThanOrEqual(15000);
  });

  it("falls back to distance, then equal share, when a segment has no known duration", () => {
    const r = route([segment({ id: "a", mode: "walk", durationMinutes: undefined, distanceMeters: 400 }), segment({ id: "b", mode: "walk", durationMinutes: undefined, distanceMeters: undefined })]);
    const schedule = buildPreviewSchedule(r);
    expect(schedule).toHaveLength(2);
    for (const s of schedule) expect(s.endMs).toBeGreaterThan(s.startMs);
  });

  it("preserves each schedule entry's mode from its source segment", () => {
    const r = route([segment({ id: "a", mode: "cycle", durationMinutes: 10 })]);
    expect(buildPreviewSchedule(r)[0].mode).toBe("cycle");
  });
});
