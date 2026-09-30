import { describe, expect, it } from "vitest";
import { computeLeaveAt } from "./leaveAt";
import { durationFixture } from "./fixtures";

describe("computeLeaveAt", () => {
  it("computes the expected arrival range as departure + duration bounds", () => {
    // Leave 7:45 AM PDT = 14:45 UTC. Expected 55-63 min.
    const departure = new Date("2026-09-24T14:45:00Z");
    const duration = durationFixture({ baselineDurationMinutes: 43, lowerBoundMinutes: 55, centralEstimateMinutes: 59, upperBoundMinutes: 63 });
    const result = computeLeaveAt(duration, departure);
    expect(result.result?.expectedArrivalLower).toEqual(new Date("2026-09-24T15:40:00Z"));
    expect(result.result?.expectedArrivalCentral).toEqual(new Date("2026-09-24T15:44:00Z"));
    expect(result.result?.expectedArrivalUpper).toEqual(new Date("2026-09-24T15:48:00Z"));
  });

  it("never produces a recommendation field — only an arrival range", () => {
    const departure = new Date("2026-09-24T14:45:00Z");
    const duration = durationFixture();
    const result = computeLeaveAt(duration, departure);
    expect(result.result).not.toHaveProperty("recommendedDepartureTime");
  });

  it("computes a typical arrival and the difference from it", () => {
    const departure = new Date("2026-09-24T14:45:00Z");
    const duration = durationFixture({ baselineDurationMinutes: 43, lowerBoundMinutes: 55, centralEstimateMinutes: 59, upperBoundMinutes: 63 });
    const result = computeLeaveAt(duration, departure);
    // typical arrival = departure + 43min = 15:28. lower(15:40) - typical = 12. upper(15:48) - typical = 20.
    expect(result.result?.arrivalDifferenceFromTypicalMinutes).toEqual({ lower: 12, upper: 20 });
  });

  it("a longer expected duration produces a later expected arrival, all else equal", () => {
    const departure = new Date("2026-09-24T14:45:00Z");
    const short = computeLeaveAt(durationFixture({ centralEstimateMinutes: 40, upperBoundMinutes: 45 }), departure);
    const long = computeLeaveAt(durationFixture({ centralEstimateMinutes: 60, upperBoundMinutes: 65 }), departure);
    expect(long.result!.expectedArrivalCentral!.getTime()).toBeGreaterThan(short.result!.expectedArrivalCentral!.getTime());
  });

  it("returns 'insufficient-data' with no arrival range when duration itself is insufficient", () => {
    const departure = new Date("2026-09-24T14:45:00Z");
    const duration = durationFixture({ predictionStatus: "insufficient-data" });
    const result = computeLeaveAt(duration, departure);
    expect(result.status).toBe("insufficient-data");
    expect(result.result?.expectedArrivalLower).toBeUndefined();
  });

  it("returns 'route-disrupted' with no confident arrival range", () => {
    const departure = new Date("2026-09-24T14:45:00Z");
    const duration = durationFixture({ predictionStatus: "route-disrupted" });
    const result = computeLeaveAt(duration, departure);
    expect(result.status).toBe("route-disrupted");
    expect(result.result?.expectedArrivalLower).toBeUndefined();
  });

  it("still produces an arrival range for 'limited-data', flagged as such", () => {
    const departure = new Date("2026-09-24T14:45:00Z");
    const duration = durationFixture({ predictionStatus: "limited-data", statusReasons: ["Traffic data is unavailable."] });
    const result = computeLeaveAt(duration, departure);
    expect(result.status).toBe("limited-data");
    expect(result.result?.expectedArrivalLower).toBeDefined();
  });

  it("correctly computes an arrival range crossing midnight", () => {
    // Leave 11:45 PM PDT (2026-09-24) = 2026-09-25T06:45:00Z. Expected 40-55 min.
    const departure = new Date("2026-09-25T06:45:00Z");
    const duration = durationFixture({ baselineDurationMinutes: 45, lowerBoundMinutes: 40, centralEstimateMinutes: 47, upperBoundMinutes: 55 });
    const result = computeLeaveAt(duration, departure);
    expect(result.result?.expectedArrivalLower).toEqual(new Date("2026-09-25T07:25:00Z"));
    expect(result.result?.expectedArrivalUpper).toEqual(new Date("2026-09-25T07:40:00Z"));
  });
});
