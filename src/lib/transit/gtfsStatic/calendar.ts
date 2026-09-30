import { serviceDateWeekday } from "../gtfsTime";
import type { GtfsCalendar, GtfsCalendarDate } from "./types";

const WEEKDAY_COLUMN: Record<string, keyof GtfsCalendar> = {
  sunday: "sunday",
  monday: "monday",
  tuesday: "tuesday",
  wednesday: "wednesday",
  thursday: "thursday",
  friday: "friday",
  saturday: "saturday",
};

function isWithinDateRange(serviceDate: string, startDate: string, endDate: string): boolean {
  // GTFS dates are all "YYYYMMDD" — plain string comparison sorts correctly.
  return serviceDate >= startDate && serviceDate <= endDate;
}

/**
 * The set of `service_id`s actually running on a given GTFS service date,
 * combining `calendar.txt` (the weekday-pattern default) with
 * `calendar_dates.txt` (per-date exceptions that can both ADD service not
 * implied by the weekday pattern, and REMOVE service the weekday pattern
 * would otherwise imply — e.g. a holiday suspending weekday service, or a
 * special weekend event adding it). An exception always overrides the
 * weekday pattern for that specific date; a service defined only via
 * `calendar_dates.txt` (no `calendar.txt` row at all) is valid per the GTFS
 * spec and handled correctly here since exceptions are applied
 * independently of whether a base calendar row exists.
 */
export function activeServiceIdsForDate(
  serviceDate: string,
  calendars: GtfsCalendar[],
  calendarDates: GtfsCalendarDate[],
): Set<string> {
  const weekday = serviceDateWeekday(serviceDate);
  const active = new Set<string>();

  if (weekday) {
    const column = WEEKDAY_COLUMN[weekday];
    for (const calendar of calendars) {
      if (calendar[column] === "1" && isWithinDateRange(serviceDate, calendar.start_date, calendar.end_date)) {
        active.add(calendar.service_id);
      }
    }
  }

  for (const exception of calendarDates) {
    if (exception.date !== serviceDate) continue;
    if (exception.exception_type === "1") {
      active.add(exception.service_id);
    } else if (exception.exception_type === "2") {
      active.delete(exception.service_id);
    }
  }

  return active;
}
