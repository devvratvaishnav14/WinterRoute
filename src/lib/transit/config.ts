/**
 * Server-only access to the TransLink API key.
 *
 * `TRANSLINK_API_KEY` is deliberately NOT prefixed with `NEXT_PUBLIC_` (see
 * `lib/google/config.ts` for the same pattern) — it must never be inlined
 * into a client bundle, logged, or echoed back in an API response.
 */

export class TranslinkConfigurationError extends Error {
  constructor() {
    super("TransLink API key is not configured.");
    this.name = "TranslinkConfigurationError";
  }
}

/** Returns the server-side TransLink API key, or throws `TranslinkConfigurationError` if it's missing. */
export function getTranslinkApiKey(): string {
  const key = process.env.TRANSLINK_API_KEY;
  if (!key) {
    throw new TranslinkConfigurationError();
  }
  return key;
}
