import { describe, expect, it } from "vitest";
import { route, segment } from "@/lib/scoring/fixtures";
import { frameAtElapsedMs, segmentGeometryPoints } from "./engine";
import { buildPreviewSchedule } from "./timing";

describe("segmentGeometryPoints", () => {
  it("uses the real geometry when present", () => {
    const geom = [{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }];
    expect(segmentGeometryPoints(segment({ geometry: geom }))).toBe(geom);
  });

  it("falls back to a straight start->end line when geometry is missing", () => {
    const s = segment({ geometry: undefined, start: { label: "A", latitude: 1, longitude: 1 }, end: { label: "B", latitude: 2, longitude: 2 } });
    expect(segmentGeometryPoints(s)).toEqual([s.start, s.end]);
  });

  it("falls back for zero-length geometry arrays too", () => {
    const s = segment({ geometry: [] });
    expect(segmentGeometryPoints(s)).toEqual([s.start, s.end]);
  });
});

describe("frameAtElapsedMs — route type coverage", () => {
  it("returns null for a route with no segments (no schedule to play)", () => {
    const r = route([]);
    expect(frameAtElapsedMs(r, buildPreviewSchedule(r), 0)).toBeNull();
  });

  it("pure walk route: stays on the single walk segment throughout", () => {
    const r = route([segment({ id: "w", mode: "walk", durationMinutes: 8 })]);
    const schedule = buildPreviewSchedule(r);
    const total = schedule[schedule.length - 1].endMs;
    expect(frameAtElapsedMs(r, schedule, 0)!.mode).toBe("walk");
    expect(frameAtElapsedMs(r, schedule, total)!.mode).toBe("walk");
  });

  it("pure cycle route", () => {
    const r = route([segment({ id: "c", mode: "cycle", durationMinutes: 12 })]);
    const schedule = buildPreviewSchedule(r);
    expect(frameAtElapsedMs(r, schedule, 0)!.mode).toBe("cycle");
  });

  it("pure drive route", () => {
    const r = route([segment({ id: "d", mode: "drive", durationMinutes: 20 })]);
    const schedule = buildPreviewSchedule(r);
    expect(frameAtElapsedMs(r, schedule, 0)!.mode).toBe("drive");
  });

  it("pure transit route (bus only)", () => {
    const r = route([segment({ id: "b", mode: "bus", durationMinutes: 25 })]);
    const schedule = buildPreviewSchedule(r);
    expect(frameAtElapsedMs(r, schedule, 0)!.mode).toBe("bus");
  });
});

describe("frameAtElapsedMs — mixed-mode transitions", () => {
  const r = route([
    segment({ id: "w1", mode: "walk", durationMinutes: 5 }),
    segment({ id: "bus1", mode: "bus", durationMinutes: 35 }),
    segment({ id: "rail1", mode: "rail", durationMinutes: 15 }),
    segment({ id: "w2", mode: "walk", durationMinutes: 5 }),
  ]);
  const schedule = buildPreviewSchedule(r);

  it("starts on the first segment's mode at elapsed 0", () => {
    const frame = frameAtElapsedMs(r, schedule, 0)!;
    expect(frame.segmentId).toBe("w1");
    expect(frame.mode).toBe("walk");
  });

  it("transitions cleanly to bus once the walk segment's slice ends", () => {
    const busStart = schedule.find((s) => s.segmentId === "bus1")!.startMs;
    const frame = frameAtElapsedMs(r, schedule, busStart)!;
    expect(frame.segmentId).toBe("bus1");
    expect(frame.mode).toBe("bus");
  });

  it("transitions from bus to rail at the transfer boundary", () => {
    const railStart = schedule.find((s) => s.segmentId === "rail1")!.startMs;
    const frame = frameAtElapsedMs(r, schedule, railStart)!;
    expect(frame.segmentId).toBe("rail1");
    expect(frame.mode).toBe("rail");
  });

  it("transitions back to walk for the final leg, and reaches the destination at the very end", () => {
    const total = schedule[schedule.length - 1].endMs;
    const finalFrame = frameAtElapsedMs(r, schedule, total)!;
    expect(finalFrame.segmentId).toBe("w2");
    expect(finalFrame.mode).toBe("walk");
    expect(finalFrame.overallProgress).toBeCloseTo(1, 5);
  });

  it("overall progress increases monotonically across the whole preview", () => {
    const total = schedule[schedule.length - 1].endMs;
    const samples = [0, total * 0.25, total * 0.5, total * 0.75, total].map((t) => frameAtElapsedMs(r, schedule, t)!.overallProgress);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });

  it("clamps elapsed time outside the schedule bounds rather than throwing", () => {
    expect(frameAtElapsedMs(r, schedule, -500)!.segmentId).toBe("w1");
    const total = schedule[schedule.length - 1].endMs;
    expect(frameAtElapsedMs(r, schedule, total + 10000)!.segmentId).toBe("w2");
  });
});
