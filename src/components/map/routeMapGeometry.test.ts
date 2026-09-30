import { describe, expect, it } from "vitest";
import { route, segment, transitSegmentAnalysis } from "@/lib/scoring/fixtures";
import {
  allRoutePoints,
  boundsFromPoints,
  isDegenerateBounds,
  legendEntriesFor,
  routeHasGeometry,
  segmentPath,
  styleForMode,
  transitBoardingWaypoints,
} from "./routeMapGeometry";

describe("segmentPath", () => {
  it("uses the segment's real road-following geometry when present", () => {
    const s = segment({
      geometry: [
        { latitude: 49.2, longitude: -123.1 },
        { latitude: 49.21, longitude: -123.11 },
      ],
    });
    expect(segmentPath(s)).toEqual([
      { lat: 49.2, lng: -123.1 },
      { lat: 49.21, lng: -123.11 },
    ]);
  });

  it("falls back to a straight start-to-end line when geometry is missing, rather than dropping the segment", () => {
    const s = segment({ geometry: undefined });
    const path = segmentPath(s);
    expect(path).toHaveLength(2);
    expect(path[0]).toEqual({ lat: s.start.latitude, lng: s.start.longitude });
    expect(path[1]).toEqual({ lat: s.end.latitude, lng: s.end.longitude });
  });
});

describe("routeHasGeometry", () => {
  it("is true when at least one segment has real geometry", () => {
    expect(routeHasGeometry(route([segment({ geometry: [{ latitude: 1, longitude: 1 }] })]))).toBe(true);
  });

  it("is false when no segment has geometry", () => {
    expect(routeHasGeometry(route([segment({ geometry: undefined })]))).toBe(false);
  });
});

describe("allRoutePoints", () => {
  it("falls back to origin/destination only when the route has no geometry at all", () => {
    const r = route([segment({ geometry: undefined })]);
    const points = allRoutePoints(r);
    expect(points).toEqual([
      { lat: r.origin.latitude, lng: r.origin.longitude },
      { lat: r.destination.latitude, lng: r.destination.longitude },
    ]);
  });
});

describe("styleForMode", () => {
  it("gives walk a dashed treatment, distinct from drive's solid line", () => {
    expect(styleForMode("walk").dashed).toBe(true);
    expect(styleForMode("drive").dashed).toBe(false);
  });

  it("gives every mode its own distinct route color — never a shared identical color across two modes", () => {
    const modes = ["walk", "cycle", "bus", "rail", "drive"] as const;
    const colors = modes.map((m) => styleForMode(m).routeColor);
    expect(new Set(colors).size).toBe(modes.length);
  });

  it("gives rail a visually distinct color from bus", () => {
    expect(styleForMode("rail").routeColor).not.toBe(styleForMode("bus").routeColor);
  });

  it("gives every mode the same casing (halo) color and a route stroke thicker/higher-contrast than a thin single line", () => {
    const modes = ["walk", "cycle", "bus", "rail", "drive"] as const;
    const casingColors = new Set(modes.map((m) => styleForMode(m).casingColor));
    expect(casingColors.size).toBe(1);
    for (const mode of modes) {
      const style = styleForMode(mode);
      expect(style.casingWeight).toBeGreaterThan(style.routeWeight);
      expect(style.casingWeight).toBeGreaterThanOrEqual(8);
      expect(style.routeWeight).toBeGreaterThanOrEqual(5);
    }
  });

  it("communicates walking mode through more than color alone (a dashed pattern)", () => {
    expect(styleForMode("walk").dashed).toBe(true);
    for (const mode of ["cycle", "bus", "rail", "drive"] as const) {
      expect(styleForMode(mode).dashed).toBe(false);
    }
  });
});

describe("legendEntriesFor", () => {
  it("shows no legend for a single-mode route", () => {
    expect(legendEntriesFor(route([segment({ mode: "drive" }), segment({ mode: "drive" })]))).toEqual([]);
  });

  it("shows a legend entry per distinct mode for a mixed transit route", () => {
    const entries = legendEntriesFor(route([segment({ mode: "walk" }), segment({ mode: "bus" }), segment({ mode: "walk" })]));
    expect(entries.map((e) => e.mode).sort()).toEqual(["bus", "walk"]);
  });
});

describe("boundsFromPoints / isDegenerateBounds", () => {
  it("computes the enclosing bounds of a set of points", () => {
    const bounds = boundsFromPoints([
      { lat: 49.1, lng: -123.2 },
      { lat: 49.3, lng: -123.0 },
    ]);
    expect(bounds).toEqual({ north: 49.3, south: 49.1, east: -123.0, west: -123.2 });
  });

  it("flags a single-point bounds as degenerate (very short trip)", () => {
    expect(isDegenerateBounds(boundsFromPoints([{ lat: 49.28, lng: -123.1 }]))).toBe(true);
  });

  it("does not flag a genuine bounds (Vancouver to Surrey scale) as degenerate", () => {
    expect(
      isDegenerateBounds(
        boundsFromPoints([
          { lat: 49.28, lng: -123.12 },
          { lat: 49.19, lng: -122.85 },
        ]),
      ),
    ).toBe(false);
  });
});

describe("transitBoardingWaypoints", () => {
  it("creates one numbered waypoint per transit leg with a real boarding stop", () => {
    const r = route([
      segment({ id: "w1", mode: "walk" }),
      segment({ id: "b1", mode: "bus" }),
      segment({ id: "w2", mode: "walk" }),
      segment({ id: "b2", mode: "bus" }),
    ]);
    const transitSegments = [
      transitSegmentAnalysis({ routeSegmentId: "b1", originStop: { providerStopId: "1", name: "Stop A", latitude: 49.2, longitude: -123.1 } }),
      transitSegmentAnalysis({ routeSegmentId: "b2", originStop: { providerStopId: "2", name: "Stop B", latitude: 49.25, longitude: -123.05 } }),
    ];
    const waypoints = transitBoardingWaypoints(r, transitSegments);
    expect(waypoints.map((w) => w.label)).toEqual(["1", "2"]);
    expect(waypoints[0].position).toEqual({ lat: 49.2, lng: -123.1 });
  });

  it("gracefully omits a leg with no matched boarding stop, rather than guessing a location", () => {
    const r = route([segment({ id: "b1", mode: "bus" })]);
    const waypoints = transitBoardingWaypoints(r, [transitSegmentAnalysis({ routeSegmentId: "b1", originStop: undefined })]);
    expect(waypoints).toEqual([]);
  });

  it("produces no waypoints for a non-transit route", () => {
    const r = route([segment({ id: "d1", mode: "drive" })]);
    expect(transitBoardingWaypoints(r, [])).toEqual([]);
  });
});
