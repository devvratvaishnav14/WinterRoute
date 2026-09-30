import { describe, expect, it } from "vitest";
import type { RouteSegment } from "./types";
import { describeRouteModes, formatDistanceMeters, formatDurationMinutes } from "./format";

function segment(mode: RouteSegment["mode"]): RouteSegment {
  return {
    id: mode,
    mode,
    start: { label: "A", latitude: 0, longitude: 0 },
    end: { label: "B", latitude: 0, longitude: 0 },
  };
}

describe("describeRouteModes", () => {
  it("describes a single-segment route", () => {
    expect(describeRouteModes([segment("drive")])).toBe("Drive");
  });

  it("describes a multi-segment transit route in order", () => {
    expect(describeRouteModes([segment("walk"), segment("bus"), segment("rail"), segment("walk")])).toBe(
      "Walk → Bus → Rail → Walk",
    );
  });

  it("returns an empty string for no segments", () => {
    expect(describeRouteModes([])).toBe("");
  });
});

describe("formatDurationMinutes", () => {
  it("formats minutes under an hour", () => {
    expect(formatDurationMinutes(43)).toBe("43 min");
  });

  it("formats exact hours with no minutes remainder", () => {
    expect(formatDurationMinutes(120)).toBe("2 hr");
  });

  it("formats hours with a minutes remainder, zero-padded", () => {
    expect(formatDurationMinutes(67)).toBe("1 hr 07 min");
  });

  it("rounds fractional minutes", () => {
    expect(formatDurationMinutes(43.6)).toBe("44 min");
  });
});

describe("formatDistanceMeters", () => {
  it("formats sub-kilometer distances in meters", () => {
    expect(formatDistanceMeters(850)).toBe("850 m");
  });

  it("formats kilometer-plus distances with one decimal", () => {
    expect(formatDistanceMeters(18554)).toBe("18.6 km");
  });
});
