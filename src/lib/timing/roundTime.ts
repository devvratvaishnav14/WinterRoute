/**
 * Minute-precision rounding for absolute instants. Pure millisecond
 * arithmetic on `Date` (epoch-based) — never string/clock manipulation —
 * which is what makes this correct across DST transitions and midnight
 * crossings for free: an absolute instant plus/minus N minutes is always
 * the same real moment regardless of what calendar date or UTC offset it
 * lands on. See docs/decisions/0011-timing-recommendation-v0.md "Timezone
 * and DST handling."
 */

/** Floors to the start of the current minute — used for a "leave by" time, so the recommendation never rounds UP into an unsafe later minute. */
export function floorToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000);
}

/** Rounds to the nearest minute — used for expected-arrival times, where ordinary rounding (not a directional safety bias) is appropriate. */
export function roundToMinute(date: Date): Date {
  return new Date(Math.round(date.getTime() / 60_000) * 60_000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function diffMinutes(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 60_000;
}
