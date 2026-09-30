import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleConfigurationError, getGoogleMapsApiKey } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getGoogleMapsApiKey", () => {
  it("returns the key when configured", () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key-value");
    expect(getGoogleMapsApiKey()).toBe("test-key-value");
  });

  it("throws a safe GoogleConfigurationError (no key value) when missing", () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    expect(() => getGoogleMapsApiKey()).toThrow(GoogleConfigurationError);
    try {
      getGoogleMapsApiKey();
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleConfigurationError);
      expect(String(error)).not.toContain("test-key-value");
    }
  });
});
