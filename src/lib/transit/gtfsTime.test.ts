import { describe, expect, it } from "vitest";
import {
  formatGtfsSecondsAsTime,
  gtfsServiceDateTimeToDate,
  parseGtfsTimeToSeconds,
  previousServiceDate,
  serviceDateFor,
  serviceDateWeekday,
} from "./gtfsTime";

describe("parseGtfsTimeToSeconds", () => {
  it("parses a normal time", () => {
    expect(parseGtfsTimeToSeconds("05:05:00")).toBe(5 * 3600 + 5 * 60);
  });

  it("parses a time past 24:00:00 (service continuing after midnight) without rejecting it", () => {
    expect(parseGtfsTimeToSeconds("25:15:00")).toBe(25 * 3600 + 15 * 60);
  });

  it("handles a leading space (TransLink's real stop_times.txt has these)", () => {
    expect(parseGtfsTimeToSeconds(" 5:05:00")).toBe(5 * 3600 + 5 * 60);
  });

  it("returns null for a malformed value", () => {
    expect(parseGtfsTimeToSeconds("not-a-time")).toBeNull();
    expect(parseGtfsTimeToSeconds("")).toBeNull();
  });
});

describe("formatGtfsSecondsAsTime", () => {
  it("round-trips with parseGtfsTimeToSeconds, including past-24:00 values", () => {
    expect(formatGtfsSecondsAsTime(parseGtfsTimeToSeconds("25:15:00")!)).toBe("25:15:00");
    expect(formatGtfsSecondsAsTime(parseGtfsTimeToSeconds("05:05:00")!)).toBe("05:05:00");
  });
});

describe("gtfsServiceDateTimeToDate", () => {
  it("converts a normal service-day time correctly", () => {
    // 05:05:00 on service date 2026-09-24 (PDT, UTC-7) == 12:05 UTC.
    const result = gtfsServiceDateTimeToDate("20260924", 5 * 3600 + 5 * 60);
    expect(result).toEqual(new Date("2026-09-24T12:05:00.000Z"));
  });

  it("rolls a >24:00 time over to the next civil day, same service date", () => {
    // 25:15:00 on service date 2026-09-24 == 1:15 AM on 2026-09-25, Vancouver local.
    const rolled = gtfsServiceDateTimeToDate("20260924", 25 * 3600 + 15 * 60);
    const direct = gtfsServiceDateTimeToDate("20260925", 1 * 3600 + 15 * 60);
    expect(rolled).toEqual(direct);
  });

  it("returns null for a malformed service date", () => {
    expect(gtfsServiceDateTimeToDate("2026-09-24", 0)).toBeNull();
  });
});

describe("serviceDateFor", () => {
  it("returns the Vancouver-local calendar date in YYYYMMDD format", () => {
    expect(serviceDateFor(new Date("2026-09-24T21:00:00.000Z"))).toBe("20260924");
  });
});

describe("previousServiceDate", () => {
  it("returns the day before", () => {
    expect(previousServiceDate("20260924")).toBe("20260923");
  });

  it("handles a month boundary", () => {
    expect(previousServiceDate("20261001")).toBe("20260930");
  });

  it("handles a year boundary", () => {
    expect(previousServiceDate("20260101")).toBe("20251231");
  });
});

describe("serviceDateWeekday", () => {
  it("returns the correct weekday name", () => {
    // 2026-09-24 is a Thursday.
    expect(serviceDateWeekday("20260924")).toBe("thursday");
  });

  it("returns null for a malformed date", () => {
    expect(serviceDateWeekday("bad")).toBeNull();
  });
});
