import { describe, expect, it } from "vitest";
import {
  parseVancouverLocalDateTime,
  vancouverCalendarDate,
  vancouverLocalHour,
  vancouverLocalPartsToDate,
  vancouverLocalWeekday,
} from "./vancouverTime";

describe("parseVancouverLocalDateTime", () => {
  it("parses a summer (PDT, UTC-7) date correctly", () => {
    expect(parseVancouverLocalDateTime("2026-07-15T14:00")).toEqual(new Date("2026-07-15T21:00:00.000Z"));
  });

  it("parses a winter (PST, UTC-8) date correctly", () => {
    expect(parseVancouverLocalDateTime("2026-01-15T14:00")).toEqual(new Date("2026-01-15T22:00:00.000Z"));
  });

  it("returns undefined for a malformed string", () => {
    expect(parseVancouverLocalDateTime("not-a-date")).toBeUndefined();
  });
});

describe("vancouverLocalPartsToDate", () => {
  it("rolls hour >= 24 over to the next calendar day correctly (GTFS-style service-day time)", () => {
    // 25:15:00 on 2026-09-24 == 1:15 AM on 2026-09-25, Vancouver local time.
    const rolled = vancouverLocalPartsToDate(2026, 9, 24, 25, 15, 0);
    const direct = vancouverLocalPartsToDate(2026, 9, 25, 1, 15, 0);
    expect(rolled).toEqual(direct);
  });

  it("rolls over correctly across a DST boundary", () => {
    // PDT ends 2026-11-01 in the early morning — a >24:00 time the night
    // before should still resolve via the correct (rolled-over) offset.
    const rolled = vancouverLocalPartsToDate(2026, 10, 31, 26, 0, 0); // 2:00 AM Nov 1
    const direct = vancouverLocalPartsToDate(2026, 11, 1, 2, 0, 0);
    expect(rolled).toEqual(direct);
  });
});

describe("vancouverCalendarDate", () => {
  it("returns the local calendar date in GTFS YYYYMMDD format", () => {
    expect(vancouverCalendarDate(new Date("2026-09-24T21:00:00.000Z"))).toBe("20260924");
  });

  it("differs from the UTC date near a day boundary", () => {
    // 2026-09-25T06:00:00Z is 2026-09-24 (11pm PDT) in Vancouver — a full day earlier by UTC date.
    expect(vancouverCalendarDate(new Date("2026-09-25T06:00:00.000Z"))).toBe("20260924");
  });
});

describe("vancouverLocalHour", () => {
  it("returns the correct local hour (PDT, UTC-7)", () => {
    expect(vancouverLocalHour(new Date("2026-09-24T15:00:00.000Z"))).toBe(8);
  });

  it("rolls over correctly across a UTC day boundary", () => {
    // 2026-09-25T06:30:00Z is 11:30pm on 2026-09-24 in Vancouver.
    expect(vancouverLocalHour(new Date("2026-09-25T06:30:00.000Z"))).toBe(23);
  });
});

describe("vancouverLocalWeekday", () => {
  it("returns the correct weekday name", () => {
    // 2026-09-24T15:00:00Z is a Thursday morning in Vancouver.
    expect(vancouverLocalWeekday(new Date("2026-09-24T15:00:00.000Z"))).toBe("thursday");
  });

  it("differs from the UTC weekday near a day boundary", () => {
    // 2026-09-25T06:30:00Z is UTC-Friday but still Thursday night in Vancouver.
    expect(vancouverLocalWeekday(new Date("2026-09-25T06:30:00.000Z"))).toBe("thursday");
  });
});
