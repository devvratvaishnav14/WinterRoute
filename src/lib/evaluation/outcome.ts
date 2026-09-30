import type { CommuteOutcome } from "./types";

const OPTIONAL_OUTCOME_FIELDS: Array<keyof Omit<CommuteOutcome, "outcomeCompleteness">> = [
  "actualDepartureTime",
  "actualArrivalTime",
  "actualDurationMinutes",
  "observedDelayFromBaselineMinutes",
  "transitCancellationObserved",
  "transitDelaySecondsObserved",
  "majorServiceAlertActive",
  "relevantRoadEventActive",
  "observedWeather",
];

/**
 * A plain, honest summary of how much of an outcome record is actually
 * filled in — never inferred as "complete" just because the record
 * exists. `"none"` when nothing factual was ever recorded, `"partial"`
 * when some but not all fields are known, `"complete"` only when every
 * optional field has a value.
 */
export function assessOutcomeCompleteness(
  outcome: Omit<CommuteOutcome, "outcomeCompleteness">,
): CommuteOutcome["outcomeCompleteness"] {
  const presentCount = OPTIONAL_OUTCOME_FIELDS.filter((field) => outcome[field] !== undefined).length;
  if (presentCount === 0) return "none";
  if (presentCount === OPTIONAL_OUTCOME_FIELDS.length) return "complete";
  return "partial";
}

/** Builds a `CommuteOutcome`, computing `outcomeCompleteness` from whichever fields were actually supplied — never fabricating a default for a missing one. */
export function createCommuteOutcome(fields: Omit<CommuteOutcome, "outcomeCompleteness">): CommuteOutcome {
  return { ...fields, outcomeCompleteness: assessOutcomeCompleteness(fields) };
}
