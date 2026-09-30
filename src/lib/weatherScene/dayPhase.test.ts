import { afterEach, describe, expect, it, vi } from "vitest";
import { computeDayPhase } from "./dayPhase";

const VANCOUVER = { latitude: 49.28, longitude: -123.12 };

afterEach(() => vi.useRealTimers());

describe("computeDayPhase", () => {
  it("reads day at clear midday UTC (early afternoon Pacific time)", () => {
    expect(computeDayPhase(VANCOUVER.latitude, VANCOUVER.longitude, new Date("2026-09-24T20:00:00Z"))).toBe("day");
  });

  it("reads night at clear midnight-ish UTC (very early Pacific morning)", () => {
    expect(computeDayPhase(VANCOUVER.latitude, VANCOUVER.longitude, new Date("2026-09-24T08:00:00Z"))).toBe("night");
  });

  it("reads night in the evening, well after sunset", () => {
    // ~11pm PDT
    expect(computeDayPhase(VANCOUVER.latitude, VANCOUVER.longitude, new Date("2026-09-25T06:00:00Z"))).toBe("night");
  });

  it("correctly straddles a midnight-crossing journey — different instants a few hours apart resolve differently", () => {
    const eveningBeforeMidnight = computeDayPhase(VANCOUVER.latitude, VANCOUVER.longitude, new Date("2026-09-24T04:00:00Z")); // ~9pm PDT
    const middayNextDay = computeDayPhase(VANCOUVER.latitude, VANCOUVER.longitude, new Date("2026-09-24T20:00:00Z")); // ~1pm PDT
    expect(eveningBeforeMidnight).toBe("night");
    expect(middayNextDay).toBe("day");
  });

  it("derives from the selected trip time, not the caller's real current clock — a daytime future trip resolves as day even while 'now' is night", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T08:00:00Z")); // real "now" is Pacific nighttime
    const futureDaytimeTrip = new Date("2026-09-26T20:00:00Z"); // a future trip at Pacific midday
    expect(computeDayPhase(VANCOUVER.latitude, VANCOUVER.longitude, futureDaytimeTrip)).toBe("day");
  });

  it("derives from the selected trip time even when 'now' is daytime and the trip is nighttime", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T20:00:00Z")); // real "now" is Pacific daytime
    const futureNightTrip = new Date("2026-09-26T08:00:00Z"); // a future trip at Pacific nighttime
    expect(computeDayPhase(VANCOUVER.latitude, VANCOUVER.longitude, futureNightTrip)).toBe("night");
  });

  it("is consistent across seasons (winter solstice midday is still day, despite a shorter day length)", () => {
    expect(computeDayPhase(VANCOUVER.latitude, VANCOUVER.longitude, new Date("2026-12-21T20:00:00Z"))).toBe("day");
  });
});
