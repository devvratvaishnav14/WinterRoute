import { riskModelV0Config } from "./config";

/**
 * A deterministic (not cryptographic) fingerprint of `riskModelV0Config`
 * — lets a stored prediction later be traced back to exactly which
 * thresholds/weights produced it, and lets two predictions be compared to
 * tell "the scoring config changed" apart from "the provider data
 * changed." Deliberately not a real hash algorithm (SHA-256 etc.) — the
 * project brief is explicit that this doesn't need cryptographic
 * infrastructure, just stability (same config in, same fingerprint out,
 * every time) and sensitivity to change (any material config edit
 * produces a different fingerprint).
 */

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

/** A small, fast, non-cryptographic string hash (djb2 variant) — stable across runs/platforms for the same input string. */
export function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The current `riskModelV0Config`'s fingerprint. Recomputed each call (cheap) rather than cached, so it's always accurate even if the config were ever hot-reloaded. */
export function computeConfigFingerprint(): string {
  return djb2Hash(stableStringify(riskModelV0Config));
}
