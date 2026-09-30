import { djb2Hash, stableStringify } from "@/lib/scoring/configFingerprint";
import { durationModelV0Config } from "./config";

/**
 * A deterministic (non-cryptographic) fingerprint of
 * `durationModelV0Config` — same purpose and mechanism as the risk
 * model's `lib/scoring/configFingerprint.ts` (reusing its generic
 * stringify/hash helpers rather than duplicating them): lets a stored
 * duration prediction be traced back to exactly which thresholds/
 * allowances produced it.
 */
export function computeDurationConfigFingerprint(): string {
  return djb2Hash(stableStringify(durationModelV0Config));
}
