"use client";

/**
 * Loads the Google Maps JavaScript API using the current recommended
 * "dynamic library import" approach (see
 * https://developers.google.com/maps/documentation/javascript/load-maps-js-api):
 * the base script exposes `google.maps.importLibrary`, and individual
 * libraries ("maps", "marker", ...) are fetched on demand only when a
 * caller actually needs them, rather than being bundled into one big
 * up-front load.
 *
 * The base script itself is injected at most ONCE per page load — every
 * caller (every `RouteMap` mount, including React 19 dev-mode's
 * double-invoked effects) shares the same cached promise, so switching
 * between the results view and Edit-trip-and-back never re-injects the
 * script or creates a second `google.maps` namespace.
 *
 * This is browser-only, Google-specific code — kept inside
 * `components/map/` on purpose so the rest of the app never touches
 * `google.maps.*` directly (see docs/architecture.md "Map visualization
 * architecture").
 */

declare global {
  interface Window {
    google?: typeof google;
  }
}

const SCRIPT_ELEMENT_ID = "winterroute-google-maps-script";
const CALLBACK_NAME = "__winterRouteGoogleMapsLoaded";

let loadPromise: Promise<typeof google> | null = null;

/**
 * Resolves once `google.maps.importLibrary` is callable. Rejects (once,
 * cached) if `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is missing or the
 * script fails to load — callers should treat that as "map unavailable,"
 * never let it break anything else on the page.
 */
export function loadGoogleMaps(): Promise<typeof google> {
  if (loadPromise) return loadPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!apiKey) {
    loadPromise = Promise.reject(
      new Error("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is not configured — the browser map key must be public/client-side, distinct from the private server GOOGLE_MAPS_API_KEY."),
    );
    return loadPromise;
  }

  // Already loaded by an earlier mount (e.g. before a fast-refresh
  // remount in dev) — reuse it rather than injecting a second script.
  if (window.google?.maps) {
    loadPromise = Promise.resolve(window.google);
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ELEMENT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google as typeof google));
      existing.addEventListener("error", () => reject(new Error("The Google Maps JavaScript API could not load.")));
      return;
    }

    (window as unknown as Record<string, () => void>)[CALLBACK_NAME] = () => {
      resolve(window.google as typeof google);
    };

    const script = document.createElement("script");
    script.id = SCRIPT_ELEMENT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${CALLBACK_NAME}`;
    script.onerror = () => reject(new Error("The Google Maps JavaScript API could not load."));
    document.head.append(script);
  });

  return loadPromise;
}

/** Test-only: resets the cached load promise so each test starts clean. */
export function __resetGoogleMapsLoaderForTests(): void {
  loadPromise = null;
}
