import { describe, expect, it } from "vitest";
import type { ResolvedLocation } from "@/lib/route/types";
import {
  MAX_PREDICTION_WINDOW_HOURS,
  parseTripDateTime,
  validateTripDateTime,
  validateTripForm,
  type TripFormInput,
} from "./validation";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// A fixed instant with zero seconds/ms, so "floored to the minute" tests are exact.
const NOW = new Date("2026-01-01T12:00:00.000Z");

describe("validateTripDateTime", () => {
  it("rejects a trip in the past", () => {
    const fiveMinutesAgo = new Date(NOW.getTime() - 5 * MINUTE_MS);
    expect(validateTripDateTime(fiveMinutesAgo, NOW)).toEqual({
      valid: false,
      issue: "past",
    });
  });

  it("rejects a trip in the previous minute", () => {
    const previousMinute = new Date(NOW.getTime() - MINUTE_MS);
    expect(validateTripDateTime(previousMinute, NOW)).toEqual({
      valid: false,
      issue: "past",
    });
  });

  it("accepts a trip in the current minute even once seconds have elapsed", () => {
    // Regression test for the bug caught during manual testing: the form's
    // default time is set once at mount with minute precision, so "now"
    // must be floored to the minute before comparing — otherwise a value
    // equal to "now" reads as already past the moment any time passes.
    const startOfCurrentMinute = new Date(NOW.getTime());
    const laterInSameMinute = new Date(NOW.getTime() + 45 * 1000); // NOW + 45s, same minute

    expect(validateTripDateTime(startOfCurrentMinute, laterInSameMinute)).toEqual({
      valid: true,
    });
  });

  it("accepts a future trip within the 72-hour window", () => {
    const in24Hours = new Date(NOW.getTime() + 24 * HOUR_MS);
    expect(validateTripDateTime(in24Hours, NOW)).toEqual({ valid: true });
  });

  it("accepts a trip exactly at the 72-hour boundary", () => {
    const exactlyAtBoundary = new Date(NOW.getTime() + MAX_PREDICTION_WINDOW_HOURS * HOUR_MS);
    expect(validateTripDateTime(exactlyAtBoundary, NOW)).toEqual({ valid: true });
  });

  it("rejects a trip one minute past the 72-hour boundary", () => {
    const pastBoundary = new Date(
      NOW.getTime() + MAX_PREDICTION_WINDOW_HOURS * HOUR_MS + MINUTE_MS,
    );
    expect(validateTripDateTime(pastBoundary, NOW)).toEqual({
      valid: false,
      issue: "beyond-window",
    });
  });

  it("rejects a trip well beyond 72 hours", () => {
    const in100Hours = new Date(NOW.getTime() + 100 * HOUR_MS);
    expect(validateTripDateTime(in100Hours, NOW)).toEqual({
      valid: false,
      issue: "beyond-window",
    });
  });
});

describe("parseTripDateTime", () => {
  it("combines a date and time into a local Date", () => {
    const result = parseTripDateTime("2026-01-01", "07:30");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(0);
    expect(result?.getDate()).toBe(1);
    expect(result?.getHours()).toBe(7);
    expect(result?.getMinutes()).toBe(30);
  });

  it("returns null when the date is missing", () => {
    expect(parseTripDateTime("", "07:30")).toBeNull();
  });

  it("returns null when the time is missing", () => {
    expect(parseTripDateTime("2026-01-01", "")).toBeNull();
  });

  it("returns null for an unparseable value", () => {
    expect(parseTripDateTime("not-a-date", "not-a-time")).toBeNull();
  });
});

describe("validateTripForm", () => {
  const sfuBurnaby: ResolvedLocation = {
    label: "SFU Burnaby",
    latitude: 49.2781,
    longitude: -122.9199,
    provider: "google-places",
    providerPlaceId: "place-sfu",
  };
  const downtownVancouver: ResolvedLocation = {
    label: "Downtown Vancouver",
    latitude: 49.2827,
    longitude: -123.1207,
    provider: "google-places",
    providerPlaceId: "place-downtown",
  };

  const baseInput: TripFormInput = {
    origin: sfuBurnaby,
    destination: downtownVancouver,
    timePreference: "arriveBy",
    date: "2026-01-02",
    time: "08:00",
    mode: "bus",
  };

  it("builds a typed TripRequest when every field is valid", () => {
    const result = validateTripForm(baseInput, NOW);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.tripRequest).toEqual({
      origin: sfuBurnaby,
      destination: downtownVancouver,
      timePreference: "arriveBy",
      dateTime: new Date("2026-01-02T08:00"),
      mode: "bus",
    });
  });

  it("rejects a missing (unresolved) origin without throwing", () => {
    const result = validateTripForm({ ...baseInput, origin: null }, NOW);

    expect(result.valid).toBe(false);
    expect(result.errors.origin).toBe("Select a starting location from the suggestions.");
    expect(result.tripRequest).toBeUndefined();
  });

  it("rejects a missing (unresolved) destination without throwing", () => {
    const result = validateTripForm({ ...baseInput, destination: null }, NOW);

    expect(result.valid).toBe(false);
    expect(result.errors.destination).toBe("Select a destination from the suggestions.");
  });

  it("reports both missing fields at once", () => {
    const result = validateTripForm({ ...baseInput, origin: null, destination: null }, NOW);

    expect(result.errors.origin).toBeDefined();
    expect(result.errors.destination).toBeDefined();
  });

  it("rejects an incomplete date/time without throwing", () => {
    const result = validateTripForm({ ...baseInput, date: "", time: "" }, NOW);

    expect(result.valid).toBe(false);
    expect(result.errors.dateTime).toBe("Choose a date and time.");
  });

  it("surfaces a past-time error message", () => {
    const result = validateTripForm({ ...baseInput, date: "2025-12-31", time: "00:00" }, NOW);

    expect(result.errors.dateTime).toBe(
      "That time has already passed — choose a time in the future.",
    );
  });

  it("surfaces a beyond-window error message naming the limit", () => {
    const result = validateTripForm({ ...baseInput, date: "2026-01-10", time: "12:00" }, NOW);

    expect(result.errors.dateTime).toContain(`${MAX_PREDICTION_WINDOW_HOURS} hours ahead`);
  });
});
