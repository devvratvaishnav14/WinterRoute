import type { ResolvedLocation } from "@/lib/route/types";
import type { TimePreference, TransportMode, TripRequest } from "./types";

/** WinterRoute V1 only supports detailed predictions within this window. */
export const MAX_PREDICTION_WINDOW_HOURS = 72;

export type TripDateTimeIssue = "past" | "beyond-window";

export interface TripDateTimeValidationResult {
  valid: boolean;
  issue?: TripDateTimeIssue;
}

/**
 * Checks a trip date/time against the 72-hour prediction window, relative
 * to `now` (defaults to the caller's current local time). Kept separate
 * from form/UI code so the rule itself can be tested and reused wherever
 * else it's needed later (e.g. server-side re-validation).
 */
export function validateTripDateTime(
  dateTime: Date,
  now: Date = new Date(),
): TripDateTimeValidationResult {
  // Trip time inputs only carry minute precision, so "now" is floored to
  // the start of the current minute before comparing. Without this, a
  // date/time equal to "right now" (e.g. an untouched default value) would
  // read as "past" the instant a few seconds tick by after it was set.
  const flooredNowMs = Math.floor(now.getTime() / 60_000) * 60_000;
  const targetMs = dateTime.getTime();

  if (targetMs < flooredNowMs) {
    return { valid: false, issue: "past" };
  }

  const windowEndMs = flooredNowMs + MAX_PREDICTION_WINDOW_HOURS * 60 * 60 * 1000;
  if (targetMs > windowEndMs) {
    return { valid: false, issue: "beyond-window" };
  }

  return { valid: true };
}

/**
 * Combines a `YYYY-MM-DD` date input value and an `HH:mm` time input value
 * into a single local Date, matching the browser's local timezone. Returns
 * null if either part is missing or the result isn't a valid date.
 */
export function parseTripDateTime(date: string, time: string): Date | null {
  if (!date || !time) {
    return null;
  }

  const dateTime = new Date(`${date}T${time}`);
  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
}

export interface TripFormInput {
  /**
   * `null` covers both "nothing typed yet" and "typed text that was never
   * resolved to a real place" (including a resolved selection invalidated
   * by editing it afterward) — both are equally "no location" as far as
   * submission is concerned. See `components/trip/LocationAutocomplete.tsx`.
   */
  origin: ResolvedLocation | null;
  destination: ResolvedLocation | null;
  timePreference: TimePreference;
  date: string;
  time: string;
  mode: TransportMode;
}

export interface TripFormFieldErrors {
  origin?: string;
  destination?: string;
  dateTime?: string;
}

export interface TripFormValidationResult {
  valid: boolean;
  errors: TripFormFieldErrors;
  tripRequest?: TripRequest;
}

/**
 * Validates trip-form input and, if valid, builds the typed `TripRequest`.
 * Pure and UI-agnostic so it can be unit tested and reused (e.g. if
 * validation later also needs to run server-side — the routes/compute API
 * route does re-validate the date/time independently; see
 * docs/architecture.md).
 */
export function validateTripForm(
  input: TripFormInput,
  now: Date = new Date(),
): TripFormValidationResult {
  const errors: TripFormFieldErrors = {};

  if (!input.origin) {
    errors.origin = "Select a starting location from the suggestions.";
  }
  if (!input.destination) {
    errors.destination = "Select a destination from the suggestions.";
  }

  const dateTime = parseTripDateTime(input.date, input.time);

  if (!dateTime) {
    errors.dateTime = "Choose a date and time.";
  } else {
    const result = validateTripDateTime(dateTime, now);
    if (!result.valid) {
      errors.dateTime =
        result.issue === "past"
          ? "That time has already passed — choose a time in the future."
          : `WinterRoute only predicts up to ${MAX_PREDICTION_WINDOW_HOURS} hours ahead — choose a sooner time.`;
    }
  }

  if (Object.keys(errors).length > 0 || !dateTime || !input.origin || !input.destination) {
    return { valid: false, errors };
  }

  const tripRequest: TripRequest = {
    origin: input.origin,
    destination: input.destination,
    timePreference: input.timePreference,
    dateTime,
    mode: input.mode,
  };

  return { valid: true, errors, tripRequest };
}
