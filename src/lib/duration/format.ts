/**
 * Presentation-only formatting — never fabricates precision. All values
 * are rounded to whole minutes before display; the underlying model
 * values stay unrounded internally (see `computeExpectedDuration.ts`).
 */

function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${hours} hr ${String(remainder).padStart(2, "0")} min`;
}

/** e.g. "43 min" or "1 hr 15 min". */
export function formatDurationMinutes(minutes: number): string {
  return formatMinutes(minutes);
}

/** e.g. "57-65 min" or "1 hr 02-1 hr 11 min" (each bound rounded independently, so a range never implies more precision than a single value would). */
export function formatDurationRange(lowerMinutes: number, upperMinutes: number): string {
  if (Math.round(lowerMinutes) === Math.round(upperMinutes)) return formatMinutes(lowerMinutes);
  return `${formatMinutes(lowerMinutes)}–${formatMinutes(upperMinutes)}`;
}

/** e.g. "+7 to +15 min", or "up to +15 min" when the lower bound shows no added time, or "no added time expected" when neither bound exceeds baseline. */
export function formatAdditionalTime(baselineMinutes: number, lowerMinutes: number, upperMinutes: number): string {
  const additionalLower = Math.max(0, Math.round(lowerMinutes - baselineMinutes));
  const additionalUpper = Math.max(0, Math.round(upperMinutes - baselineMinutes));

  if (additionalUpper === 0) return "no added time expected";
  if (additionalLower === 0) return `up to +${additionalUpper} min`;
  if (additionalLower === additionalUpper) return `+${additionalLower} min`;
  return `+${additionalLower} to +${additionalUpper} min`;
}

/**
 * A genuine (already known to be non-zero) minute difference, e.g. an
 * expected arrival vs. typical arrival — signed, and collapsed to a
 * single value when both bounds round to the same minute. Unlike
 * `formatAdditionalTime`, this does not clamp negative values to zero,
 * since an arrival can legitimately be earlier than typical. Callers
 * that only want to show this when the difference is real should check
 * for the zero/zero case separately (see `TimingHero`'s "no additional
 * delay" branch), the same convention as `formatDelaySeconds`.
 */
export function formatMinuteDifferenceRange(lowerMinutes: number, upperMinutes: number): string {
  const lower = Math.round(lowerMinutes);
  const upper = Math.round(upperMinutes);
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  if (lower === upper) return `${signed(lower)} min`;
  return `${signed(lower)} to ${signed(upper)} min`;
}
