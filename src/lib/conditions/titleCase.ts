/**
 * A SAFE title-case formatter for short official alert titles ONLY
 * (e.g. "rainfall warning" -> "Rainfall Warning") — never call this on
 * body text/descriptions, which should keep their original sentence
 * casing. The original provider string is never mutated; this only
 * changes what's displayed.
 */
const LOWERCASE_MINOR_WORDS = new Set(["a", "an", "and", "for", "of", "the", "to", "in", "on"]);

export function formatAlertTitle(rawTitle: string): string {
  const trimmed = rawTitle.trim();
  if (trimmed.length === 0) return trimmed;

  // A title that's ENTIRELY uppercase is "shouting" — title-case every
  // word normally. Otherwise, a short all-caps word (e.g. "GPS", "ECCC")
  // is more likely a genuine embedded acronym and is left as-is.
  const isShouting = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);

  return trimmed
    .split(/\s+/)
    .map((word, index) => {
      if (word.length === 0) return word;

      if (!isShouting && index > 0 && word.length <= 5 && /^[A-Z0-9]+$/.test(word)) {
        return word;
      }

      const lower = word.toLowerCase();
      if (index > 0 && LOWERCASE_MINOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
