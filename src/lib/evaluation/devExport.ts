import { toStorableSnapshot } from "./privacy";
import { toSerializable } from "./serialization";
import type { PredictionSnapshot } from "./types";

// Deliberately NOT bare "key" — `FactorContribution.key` is a real,
// legitimate field name (e.g. "delay", "snowfall") identifying which
// contributor a score came from, and a bare `/key/i` pattern flagged it
// as a false positive during testing.
const SUSPICIOUS_KEY_PATTERN = /apikey|api_key|secret|token|password|credential/i;

/** Defensive check — nothing in this codebase's snapshot data should ever contain one of these, but this is a cheap net against a future field accidentally introducing one. */
function assertNoSuspiciousKeys(value: unknown, path = ""): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SUSPICIOUS_KEY_PATTERN.test(key)) {
      throw new Error(`Refusing to export a snapshot containing a suspicious field name: ${path}${key}`);
    }
    assertNoSuspiciousKeys(child, `${path}${key}.`);
  }
}

export interface ExportSnapshotOptions {
  /** When true (the default), redacts exact location labels via `toStorableSnapshot` before exporting — matching the privacy-conscious future-storage shape. Set `false` only for genuinely local, throwaway inspection where the full labels are actually useful. */
  redact?: boolean;
  /** Pretty-print with this many spaces of indentation (default 2). Pass `0` for compact JSON. */
  indent?: number;
}

/**
 * Formats a `PredictionSnapshot` as JSON for development inspection —
 * manual review, future fixture creation, or preserving an interesting
 * real-world case. Never includes API keys/secrets (there are none in
 * this data shape to begin with — verified defensively below) and never
 * a raw provider payload (the snapshot only ever holds already-normalized
 * `CommuteFeatureSet` data). Defaults to the redacted/coarsened shape;
 * this is a development utility, not a user-facing feature.
 */
export function exportSnapshotAsJson(snapshot: PredictionSnapshot, options: ExportSnapshotOptions = {}): string {
  const { redact = true, indent = 2 } = options;

  const exportable = redact ? toStorableSnapshot(snapshot) : toSerializable(snapshot);
  assertNoSuspiciousKeys(exportable);

  return JSON.stringify(exportable, null, indent);
}
