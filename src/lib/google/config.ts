/**
 * Server-only access to the Google Maps Platform API key.
 *
 * `GOOGLE_MAPS_API_KEY` is deliberately NOT prefixed with `NEXT_PUBLIC_`, so
 * Next.js never inlines it into client bundles (see
 * node_modules/next/dist/docs/01-app/02-guides/environment-variables.md).
 * This module must only ever be imported from server-side code (Route
 * Handlers, other server-only modules) — importing it from a "use client"
 * component would be a build-time mistake, not just a runtime one, since
 * `process.env.GOOGLE_MAPS_API_KEY` (no `NEXT_PUBLIC_` prefix) resolves to
 * `undefined` in client bundles by design.
 */

export class GoogleConfigurationError extends Error {
  constructor() {
    super("Google Maps API key is not configured.");
    this.name = "GoogleConfigurationError";
  }
}

/**
 * Returns the server-side API key, or throws `GoogleConfigurationError` if
 * it's missing. Callers (Route Handlers) should catch this and return a
 * generic "service not configured" response — never echo the underlying
 * error object, which could otherwise leak env var names to the client.
 */
export function getGoogleMapsApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new GoogleConfigurationError();
  }
  return key;
}
