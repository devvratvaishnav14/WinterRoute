import { describe, expect, it } from "vitest";
import type { Route } from "@/lib/route/types";
import { NEAR_TERM_THRESHOLD_HOURS, classifyTrafficRecency, resolveTrafficDepartureTime } from "./timeline";

function loc(label: string) {
  return { label, latitude: 49.28, longitude: -122.92 };
}

function driveRoute(baselineDurationMinutes: number | undefined): Route {
  return {
    origin: loc("A"),
    destination: loc("B"),
    baselineDurationMinutes,
    segments: [{ id: "drive-1", mode: "drive", start: loc("A"), end: loc("B"), durationMinutes: baselineDurationMinutes }],
  };
}

describe("resolveTrafficDepartureTime", () => {
  it("uses the user's chosen time as-is for Leave At", () => {
    const leaveTime = new Date("2026-09-24T16:00:00Z");
    const result = resolveTrafficDepartureTime(driveRoute(30), "leaveAt", leaveTime);
    expect(result).toEqual({ departureTime: leaveTime, isNominal: false });
  });

  it("derives a nominal baseline departure for Arrive By (arrival - baseline duration)", () => {
    const arrivalTime = new Date("2026-09-24T17:00:00Z");
    const result = resolveTrafficDepartureTime(driveRoute(36), "arriveBy", arrivalTime);
    expect(result).toEqual({ departureTime: new Date("2026-09-24T16:24:00Z"), isNominal: true });
  });

  it("returns null when there's no baseline duration to derive a nominal timeline from", () => {
    const result = resolveTrafficDepartureTime(driveRoute(undefined), "arriveBy", new Date("2026-09-24T17:00:00Z"));
    expect(result).toBeNull();
  });
});

describe("classifyTrafficRecency", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it("classifies a departure within the near-term threshold", () => {
    const departure = new Date(now.getTime() + (NEAR_TERM_THRESHOLD_HOURS - 1) * 60 * 60 * 1000);
    expect(classifyTrafficRecency(departure, now)).toBe("near-term");
  });

  it("classifies a departure exactly at the threshold as near-term (inclusive)", () => {
    const departure = new Date(now.getTime() + NEAR_TERM_THRESHOLD_HOURS * 60 * 60 * 1000);
    expect(classifyTrafficRecency(departure, now)).toBe("near-term");
  });

  it("classifies a departure beyond the threshold as future", () => {
    const departure = new Date(now.getTime() + (NEAR_TERM_THRESHOLD_HOURS + 1) * 60 * 60 * 1000);
    expect(classifyTrafficRecency(departure, now)).toBe("future");
  });

  it("classifies a departure 70 hours out as future", () => {
    const departure = new Date(now.getTime() + 70 * 60 * 60 * 1000);
    expect(classifyTrafficRecency(departure, now)).toBe("future");
  });
});
