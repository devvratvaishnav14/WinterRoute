import { djb2Hash, stableStringify } from "@/lib/scoring/configFingerprint";
import { timingModelV0Config } from "./config";

/** A deterministic (non-cryptographic) fingerprint of `timingModelV0Config` — same mechanism/purpose as the risk and duration models' fingerprints, reusing their generic stringify/hash helpers. */
export function computeTimingConfigFingerprint(): string {
  return djb2Hash(stableStringify(timingModelV0Config));
}
