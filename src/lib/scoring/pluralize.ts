/**
 * The shared grammar helper for every "N word(s)" deterministic
 * explanation sentence WinterRoute generates — so none of them fall
 * back to the "(s)" shorthand. Reused from `lib/duration/` as well
 * (an existing cross-import direction — duration already reads
 * `CommuteFeatureSet` from `lib/scoring/types`).
 */
export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/** e.g. `formatCount(1, "alert")` -> "1 alert", `formatCount(3, "alert")` -> "3 alerts". */
export function formatCount(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}
