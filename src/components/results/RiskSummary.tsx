import type { RiskLabel } from "@/lib/scoring/types";
import type { RiskPreviewState } from "@/components/trip/RiskPreview";

const LABEL_COLOR: Record<RiskLabel, string> = {
  Low: "text-emerald-300",
  Moderate: "text-amber-200",
  High: "text-orange-300",
  "Very High": "text-rose-300",
};

/**
 * The commute-disruption badge — restrained severity color, never
 * neon/alarming. Labeled "Commute disruption" (not "Commute risk") in
 * the normal user-facing UI, since "risk" invites "risk of what?" —
 * the underlying `ExperimentalCommuteRiskV0` domain type/field names are
 * unchanged, this is a presentation-only rename. The qualitative label
 * (Low/Moderate/High/Very High) is visually primary; the raw 0-100
 * index is secondary and explicitly never phrased as a probability or
 * percentage — see the "Experimental disruption index" caveat below.
 */
export function RiskSummary({ state }: { state: RiskPreviewState | null }) {
  if (!state) return null;
  const { risk } = state;

  if (risk.predictionStatus === "insufficient-data") {
    return (
      <div>
        <p className="text-xs font-medium tracking-[0.2em] text-white/55 uppercase">Commute disruption</p>
        <p className="mt-1 text-white/60">Unavailable</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-medium tracking-[0.2em] text-white/55 uppercase">Commute disruption</p>
      <p className={`mt-1 text-2xl font-semibold ${LABEL_COLOR[risk.label]}`}>{risk.label}</p>
      <p className="mt-1 text-sm text-white/62">
        WinterRoute index: {risk.overallIndex} / 100
      </p>
      <p className="mt-1 text-[11px] text-white/55">Experimental disruption index · WinterRoute V0</p>
      {risk.predictionStatus === "limited-data" ? <p className="mt-1 text-[11px] text-amber-200/70">Limited data</p> : null}
    </div>
  );
}
