import type { TransportMode } from "./types";

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  walk: "Walk",
  car: "Car",
  bus: "Bus",
  train: "Train",
  cycle: "Cycle",
};

/**
 * "Today" / "Tomorrow" / a short weekday+date for anything further out.
 *
 * `locale` defaults to the viewer's browser locale (`undefined`); tests
 * pass an explicit locale so assertions don't depend on the environment
 * running them.
 */
export function formatRelativeDayLabel(
  date: Date,
  now: Date = new Date(),
  locale?: string,
): string {
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Tomorrow";

  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** `locale` defaults to the viewer's browser locale; see `formatRelativeDayLabel`. */
export function formatTripTime(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * A time-of-day range, collapsed to a single time when both bounds format
 * to the same displayed string (e.g. two Dates a few seconds apart that
 * both round to "10:14 AM") — comparing the FORMATTED output rather than
 * the raw Dates is what gives this its tolerance for free, so a caller
 * never needs to pick an arbitrary epsilon. Shared by every place
 * WinterRoute displays an arrival/departure time range, so cards and
 * explanation sentences can't disagree about whether a range is real.
 */
export function formatTimeRange(lower: Date, upper: Date, locale?: string): string {
  const lowerLabel = formatTripTime(lower, locale);
  const upperLabel = formatTripTime(upper, locale);
  return lowerLabel === upperLabel ? lowerLabel : `${lowerLabel}–${upperLabel}`;
}
