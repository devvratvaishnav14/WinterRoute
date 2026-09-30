import { describe, expect, it } from "vitest";
import { addMinutes, diffMinutes, floorToMinute, roundToMinute } from "./roundTime";

describe("floorToMinute", () => {
  it("rounds down, never up, preserving 'leave by' safety semantics", () => {
    expect(floorToMinute(new Date("2026-09-24T15:57:41.000Z"))).toEqual(new Date("2026-09-24T15:57:00.000Z"));
  });

  it("leaves an exact minute unchanged", () => {
    expect(floorToMinute(new Date("2026-09-24T15:57:00.000Z"))).toEqual(new Date("2026-09-24T15:57:00.000Z"));
  });
});

describe("roundToMinute", () => {
  it("rounds to the nearest minute", () => {
    expect(roundToMinute(new Date("2026-09-24T15:57:31.000Z"))).toEqual(new Date("2026-09-24T15:58:00.000Z"));
    expect(roundToMinute(new Date("2026-09-24T15:57:29.000Z"))).toEqual(new Date("2026-09-24T15:57:00.000Z"));
  });
});

describe("addMinutes / diffMinutes", () => {
  it("round-trips correctly", () => {
    const start = new Date("2026-09-24T15:00:00.000Z");
    const later = addMinutes(start, 43);
    expect(diffMinutes(later, start)).toBe(43);
  });

  it("handles negative minutes (subtraction)", () => {
    const start = new Date("2026-09-24T15:00:00.000Z");
    expect(addMinutes(start, -30)).toEqual(new Date("2026-09-24T14:30:00.000Z"));
  });

  it("correctly crosses a calendar-day boundary", () => {
    const start = new Date("2026-09-25T00:15:00.000Z");
    expect(addMinutes(start, -60)).toEqual(new Date("2026-09-24T23:15:00.000Z"));
  });
});
