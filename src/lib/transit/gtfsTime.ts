import { vancouverCalendarDate, vancouverLocalPartsToDate } from "@/lib/time/vancouverTime";

/**
 * Parses a GTFS "HH:MM:SS" time into total seconds since that service
 * day's midnight. GTFS explicitly allows values past 24:00:00 for trips
 * continuing after midnight, still counted as part of the *previous*
 * day's service (e.g. "25:15:00" = 1:15 AM the next civil day, same
 * service day) — this is not an error and is not rejected here.
 */
export function parseGtfsTimeToSeconds(value: string): number | null {
  const match = /^\s*(\d{1,3}):([0-5]\d):([0-5]\d)\s*$/.exec(value);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** The reverse of `parseGtfsTimeToSeconds`, for display/debugging — preserves values past 24:00:00. */
export function formatGtfsSecondsAsTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Converts a GTFS service date ("YYYYMMDD") + seconds-since-that-service-
 * day's-midnight into an absolute `Date`, America/Vancouver local time,
 * DST-aware. Values of `totalSeconds` past 86400 (i.e. hour >= 24) roll
 * over to the next civil day automatically — see
 * `vancouverLocalPartsToDate`'s doc comment for why that's not
 * special-cased here.
 */
export function gtfsServiceDateTimeToDate(serviceDate: string, totalSeconds: number): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(serviceDate);
  if (!match) return null;
  const [, year, month, day] = match;

  const hour = Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;

  return vancouverLocalPartsToDate(Number(year), Number(month), Number(day), hour, minute, second);
}

/** The America/Vancouver local calendar date for an absolute instant, in GTFS's "YYYYMMDD" format. */
export function serviceDateFor(date: Date): string {
  return vancouverCalendarDate(date);
}

/** The GTFS service date immediately before `serviceDate` — needed because a late-night trip can be encoded as the *previous* day's service using a >24:00 time (see module doc comment). Pure calendar-date arithmetic (UTC-anchored on purpose — no time-of-day is involved, so there's no DST ambiguity to resolve). */
export function previousServiceDate(serviceDate: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(serviceDate);
  if (!match) return serviceDate;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() - 1);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export const GTFS_WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type GtfsWeekday = (typeof GTFS_WEEKDAYS)[number];

/** The weekday name (matching `calendar.txt`'s column names) for a GTFS service date, per its own civil calendar (no timezone conversion needed — a date-only value has no time-of-day ambiguity). */
export function serviceDateWeekday(serviceDate: string): GtfsWeekday | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(serviceDate);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return GTFS_WEEKDAYS[date.getUTCDay()];
}
