// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetGoogleMapsLoaderForTests, loadGoogleMaps } from "./googleMapsLoader";

const ORIGINAL_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

function fireScriptLoad() {
  const script = document.getElementById("winterroute-google-maps-script");
  // The real script sets window.google itself as a side effect of loading —
  // simulate that, then invoke the callback it declares.
  window.google = { maps: {} } as unknown as typeof google;
  const callbackName = new URL((script as HTMLScriptElement).src).searchParams.get("callback");
  (window as unknown as Record<string, () => void>)[callbackName as string]?.();
}

function fireScriptError() {
  const script = document.getElementById("winterroute-google-maps-script");
  script?.dispatchEvent(new Event("error"));
}

beforeEach(() => {
  __resetGoogleMapsLoaderForTests();
  document.head.innerHTML = "";
  delete (window as { google?: unknown }).google;
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY = "test-browser-key";
});

afterEach(() => {
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe("loadGoogleMaps", () => {
  it("rejects with a clear error when the browser key is missing, rather than silently using the server key", async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    __resetGoogleMapsLoaderForTests();

    await expect(loadGoogleMaps()).rejects.toThrow(/NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY/);
  });

  it("injects exactly one script tag even when called multiple times concurrently", () => {
    void loadGoogleMaps();
    void loadGoogleMaps();
    void loadGoogleMaps();

    expect(document.querySelectorAll("#winterroute-google-maps-script").length).toBe(1);
  });

  it("uses the public browser key in the script URL, never a server-only key", () => {
    void loadGoogleMaps();
    const script = document.getElementById("winterroute-google-maps-script") as HTMLScriptElement;
    expect(script.src).toContain("key=test-browser-key");
  });

  it("resolves once the script fires its load callback", async () => {
    const promise = loadGoogleMaps();
    fireScriptLoad();
    const resolved = await promise;
    expect(resolved.maps).toBeTruthy();
  });

  it("rejects if the script fails to load, without throwing synchronously", async () => {
    const promise = loadGoogleMaps();
    fireScriptError();
    await expect(promise).rejects.toThrow(/could not load/);
  });

  it("reuses the same promise across repeated calls (never a second network load)", async () => {
    const first = loadGoogleMaps();
    const second = loadGoogleMaps();
    expect(first).toBe(second);
    fireScriptLoad();
    await first;
  });
});
