/**
 * DST-safe conversion between America/Vancouver local time and an
 * absolute `Date`, without a hardcoded UTC offset — the standard
 * double-conversion technique (treat the naive local value as UTC, see
 * what that UTC instant actually reads as in Vancouver, and use the
 * difference as the real offset). Originally written for DriveBC's
 * naive-local `schedule.intervals` (`lib/traffic/roadEvents.ts`); shared
 * here once GTFS static/realtime data needed the identical conversion.
 *
 * `vancouverLocalPartsToDate` accepts out-of-range components (e.g.
 * `hour: 25`) and lets them roll over normally — this is what makes
 * GTFS's ">24:00" service-day times (a trip continuing past midnight,
 * still counted as the previous day's service — see
 * `lib/transit/gtfsTime.ts`) work correctly for free, with no
 * special-casing.
 */
export function vancouverLocalPartsToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(guessUtcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Intl can report hour "24" for midnight in hour12:false — normalize to 0.
  const hourPart = get("hour") % 24;

  const localAsIfUtcMs = Date.UTC(get("year"), get("month") - 1, get("day"), hourPart, get("minute"), get("second"));
  const offsetMs = guessUtcMs - localAsIfUtcMs;

  return new Date(guessUtcMs + offsetMs);
}

/** Parses a naive "YYYY-MM-DDTHH:mm[:ss]" string (no timezone offset) as America/Vancouver local time. */
export function parseVancouverLocalDateTime(naive: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(naive);
  if (!match) return undefined;

  const [, year, month, day, hour, minute, second] = match;
  return vancouverLocalPartsToDate(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0"),
  );
}

/** The America/Vancouver local calendar date for an absolute instant, as "YYYYMMDD" (GTFS's date format). */
export function vancouverCalendarDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

/** The America/Vancouver local hour (0-23) for an absolute instant — used for factual temporal features (`lib/scoring/`), never for a hardcoded rush-hour risk penalty on its own. */
export function vancouverLocalHour(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Vancouver",
    hour: "2-digit",
    hour12: false,
  });
  const hour = Number(formatter.formatToParts(date).find((p) => p.type === "hour")?.value ?? "0");
  return hour % 24;
}

export const VANCOUVER_WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type VancouverWeekday = (typeof VANCOUVER_WEEKDAYS)[number];

/** The America/Vancouver local weekday for an absolute instant. */
export function vancouverLocalWeekday(date: Date): VancouverWeekday {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Vancouver",
    weekday: "long",
  });
  const name = formatter.format(date).toLowerCase();
  return VANCOUVER_WEEKDAYS.find((w) => w === name) ?? "sunday";
}
