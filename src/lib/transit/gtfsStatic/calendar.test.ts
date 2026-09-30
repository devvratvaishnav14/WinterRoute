import { describe, expect, it } from "vitest";
import { activeServiceIdsForDate } from "./calendar";
import type { GtfsCalendar, GtfsCalendarDate } from "./types";

function weekdayCalendar(overrides: Partial<GtfsCalendar> = {}): GtfsCalendar {
  return {
    service_id: "WEEKDAY",
    monday: "1",
    tuesday: "1",
    wednesday: "1",
    thursday: "1",
    friday: "1",
    saturday: "0",
    sunday: "0",
    start_date: "20260101",
    end_date: "20261231",
    ...overrides,
  };
}

describe("activeServiceIdsForDate", () => {
  it("includes a service whose weekday pattern matches and date is in range", () => {
    // 2026-09-24 is a Thursday.
    const result = activeServiceIdsForDate("20260924", [weekdayCalendar()], []);
    expect(result.has("WEEKDAY")).toBe(true);
  });

  it("excludes a service on a day its weekday pattern doesn't cover", () => {
    // 2026-09-26 is a Saturday — weekdayCalendar has saturday: "0".
    const result = activeServiceIdsForDate("20260926", [weekdayCalendar()], []);
    expect(result.has("WEEKDAY")).toBe(false);
  });

  it("excludes a service outside its date range even if the weekday matches", () => {
    const result = activeServiceIdsForDate(
      "20260924",
      [weekdayCalendar({ start_date: "20261001", end_date: "20261231" })],
      [],
    );
    expect(result.has("WEEKDAY")).toBe(false);
  });

  it("removes a normally-active service on a calendar_dates exception (exception_type 2)", () => {
    // Holiday Thursday: weekday service suspended.
    const exceptions: GtfsCalendarDate[] = [{ service_id: "WEEKDAY", date: "20260924", exception_type: "2" }];
    const result = activeServiceIdsForDate("20260924", [weekdayCalendar()], exceptions);
    expect(result.has("WEEKDAY")).toBe(false);
  });

  it("adds a service on a calendar_dates exception (exception_type 1) even though the weekday pattern wouldn't include it", () => {
    // Special Saturday service added.
    const exceptions: GtfsCalendarDate[] = [{ service_id: "SPECIAL", date: "20260926", exception_type: "1" }];
    const result = activeServiceIdsForDate("20260926", [weekdayCalendar()], exceptions);
    expect(result.has("SPECIAL")).toBe(true);
  });

  it("supports a service defined purely via calendar_dates.txt with no calendar.txt row at all", () => {
    const exceptions: GtfsCalendarDate[] = [{ service_id: "SPECIAL_ONLY", date: "20260926", exception_type: "1" }];
    const result = activeServiceIdsForDate("20260926", [], exceptions);
    expect(result.has("SPECIAL_ONLY")).toBe(true);
  });

  it("ignores exceptions for a different date", () => {
    const exceptions: GtfsCalendarDate[] = [{ service_id: "WEEKDAY", date: "20260925", exception_type: "2" }];
    const result = activeServiceIdsForDate("20260924", [weekdayCalendar()], exceptions);
    expect(result.has("WEEKDAY")).toBe(true);
  });
});
