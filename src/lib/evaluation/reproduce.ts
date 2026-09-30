import { computeConfigFingerprint } from "@/lib/scoring/configFingerprint";
import { scoreFeatures } from "@/lib/scoring/computeCommuteRisk";
import type { ExperimentalCommuteRiskV0 } from "@/lib/scoring/types";
import type { PredictionSnapshot } from "./types";

/**
 * Re-runs the scoring pipeline against a stored snapshot's OWN
 * `featureSnapshot` — never refetching any provider. This is what makes
 * a `PredictionSnapshot` reproducible: because `scoreFeatures` is pure
 * and depends on nothing but its arguments, re-evaluating a five-year-old
 * snapshot with today's code produces exactly what today's scoring logic
 * (not today's weather) would have said about yesterday's conditions —
 * which is precisely what's needed to distinguish "the scoring model
 * changed" from "the provider data changed."
 */
export function reevaluateSnapshot(snapshot: PredictionSnapshot, now: Date = snapshot.createdAt): ExperimentalCommuteRiskV0 {
  return scoreFeatures(snapshot.featureSnapshot, now);
}

export interface ReproducibilityCheck {
  /** True when re-scoring the stored features with the CURRENT scoring config reproduces the exact same index/label. */
  reproducesOriginal: boolean;
  /** True when the snapshot's own `configFingerprint` matches the currently-running config — false means the scoring config has changed since this prediction was made. */
  configUnchanged: boolean;
  currentConfigFingerprint: string;
  reevaluated: ExperimentalCommuteRiskV0;
}

/**
 * Compares a stored snapshot against a fresh re-evaluation of its own
 * feature data. If `configUnchanged` is true but `reproducesOriginal` is
 * somehow false, that would indicate a non-determinism bug in the scoring
 * pipeline itself (it should be impossible given `scoreFeatures`'s purity
 * — this check exists specifically to catch such a regression). If
 * `configUnchanged` is false, a differing index is expected and
 * meaningful: it shows exactly how much the scoring-model change alone
 * (not new provider data) moved the result for this real historical case.
 */
export function checkReproducibility(snapshot: PredictionSnapshot): ReproducibilityCheck {
  const reevaluated = reevaluateSnapshot(snapshot);
  const currentConfigFingerprint = computeConfigFingerprint();

  return {
    reproducesOriginal: reevaluated.overallIndex === snapshot.overallIndex && reevaluated.label === snapshot.label,
    configUnchanged: currentConfigFingerprint === snapshot.configFingerprint,
    currentConfigFingerprint,
    reevaluated,
  };
}
