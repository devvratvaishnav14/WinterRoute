/**
 * localStorage access that never throws and never crashes the form: it's
 * unavailable during SSR (`window` doesn't exist), can throw in private
 * browsing / with site data blocked, and can be full. All of those are
 * safe no-ops here — recent locations/trips are pure convenience, not
 * required for the app to work.
 */

export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
