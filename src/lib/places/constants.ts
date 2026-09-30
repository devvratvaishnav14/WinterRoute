/**
 * Shared between the client (debounce/min-length gating before it even asks
 * the server) and the server (defense-in-depth, since the API route can be
 * called directly, bypassing the client's own gating). Framework-agnostic
 * on purpose — no server-only imports here — so both sides can import it
 * without pulling server code into the client bundle.
 */
export const AUTOCOMPLETE_MIN_INPUT_LENGTH = 2;
export const AUTOCOMPLETE_DEBOUNCE_MS = 350;
export const AUTOCOMPLETE_MAX_INPUT_LENGTH = 200;
