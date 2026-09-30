/**
 * TransLink's own required wording (confirmed live against
 * https://www.translink.ca/about-us/doing-business-with-translink/app-developer-resources/terms-of-use)
 * — used verbatim, never paraphrased, wherever TransLink-derived data is
 * displayed. TransLink's terms also prohibit using its name/trademarks in
 * a way that implies endorsement — this attribution is purely the
 * required disclaimer text, with no logo.
 */
export const TRANSLINK_ATTRIBUTION_TEXT =
  "Some of the data used in this product or service is provided by permission of TransLink. TransLink assumes no responsibility for the accuracy or currency of the Data used in this product or service.";

/** `undefined` delay (no realtime data published) must never be displayed as "on time" — callers should check for that case separately before calling this. */
export function formatDelaySeconds(seconds: number): string {
  const minutes = Math.round(Math.abs(seconds) / 60);
  if (minutes === 0) return "On time";
  return seconds > 0 ? `+${minutes} min late` : `${minutes} min early`;
}
