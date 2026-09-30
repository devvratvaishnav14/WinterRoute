import { describe, expect, it } from "vitest";
import type { TrafficInterval } from "./types";
import { computeConditionBreakdown, formatTrafficDelay } from "./format";

function interval(condition: TrafficInterval["condition"], distanceMeters: number): TrafficInterval {
  return { startPolylineIndex: 0, endPolylineIndex: 1, condition, distanceMeters };
}

describe("computeConditionBreakdown", () => {
  it("computes distance-weighted percentages", () => {
    const result = computeConditionBreakdown([
      interval("normal", 5800),
      interval("slow", 3100),
      interval("trafficJam", 1100),
    ]);
    expect(result).toEqual({ normalPercent: 58, slowPercent: 31, trafficJamPercent: 11 });
  });

  it("returns null when there are no intervals", () => {
    expect(computeConditionBreakdown([])).toBeNull();
  });

  it("returns null when total distance is 0 rather than dividing by zero", () => {
    expect(computeConditionBreakdown([interval("normal", 0)])).toBeNull();
  });

  it("handles a single all-normal route", () => {
    expect(computeConditionBreakdown([interval("normal", 1000)])).toEqual({
      normalPercent: 100,
      slowPercent: 0,
      trafficJamPercent: 0,
    });
  });
});

describe("formatTrafficDelay", () => {
  it("formats a positive delay", () => {
    expect(formatTrafficDelay(7)).toBe("+7 min");
  });

  it("formats zero as 'No delay'", () => {
    expect(formatTrafficDelay(0)).toBe("No delay");
  });
});
