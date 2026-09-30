"use client";

import { useState } from "react";
import { createPredictionSnapshot, type CreatePredictionSnapshotParams } from "@/lib/evaluation/createSnapshot";
import { exportSnapshotAsJson } from "@/lib/evaluation/devExport";
import { pluralize } from "@/lib/scoring/pluralize";
import type { ExperimentalCommuteRiskV0, FactorScore, RiskFactorKey } from "@/lib/scoring/types";

export type RiskPreviewState = {
  status: "success";
  risk: ExperimentalCommuteRiskV0;
  /** Context needed to build a `PredictionSnapshot` for the dev-only JSON export — not derivable from `risk` alone (it doesn't know the user's originally-requested mode/time-preference). */
  snapshotContext: Omit<CreatePredictionSnapshotParams, "risk">;
};

const FACTOR_LABELS: Record<RiskFactorKey, string> = {
  weather: "Weather",
  traffic: "Traffic",
  transit: "Transit",
  roadEvents: "Road events",
};

const FACTOR_ORDER: RiskFactorKey[] = ["weather", "traffic", "transit", "roadEvents"];

function FactorRow({ factor, score }: { factor: RiskFactorKey; score: FactorScore }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1.5 last:border-0">
      <span className="text-white/70">{FACTOR_LABELS[factor]}</span>
      {score.status === "scored" ? (
        <span className="text-white/90">{score.score} / 100</span>
      ) : (
        <span className="text-[11px] text-white/40">
          {score.status === "not-applicable" ? "Not applicable" : "Unavailable"}
        </span>
      )}
    </div>
  );
}

function DevDetail({ state }: { state: RiskPreviewState }) {
  const { risk } = state;
  const [open, setOpen] = useState(false);
  const [exported, setExported] = useState<string | null>(null);

  function handleExport() {
    const snapshot = createPredictionSnapshot({ risk, ...state.snapshotContext });
    setExported(exportSnapshotAsJson(snapshot));
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-[11px] text-white/30 underline decoration-dotted underline-offset-2 hover:text-white/50"
      >
        {open ? "Hide model details" : "Show model details"}
      </button>
      {open ? (
        <div className="mt-1 space-y-2 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-white/50">
          <p>Model version: {risk.modelVersion}</p>
          <p>Config fingerprint: {risk.configFingerprint}</p>
          <p>Prediction status: {risk.predictionStatus}</p>
          <div>
            <p className="text-white/40">Factor weighting (normalized over applicable factors):</p>
            <ul className="list-inside list-disc">
              {risk.weighting.map((w) => (
                <li key={w.factor}>
                  {FACTOR_LABELS[w.factor]}: raw {w.rawWeight.toFixed(2)}
                  {w.normalizedWeight !== undefined ? `, normalized ${(w.normalizedWeight * 100).toFixed(0)}%` : " (excluded — not applicable/unavailable)"}
                </li>
              ))}
            </ul>
          </div>
          {FACTOR_ORDER.map((factor) => {
            const score = risk.factors[factor];
            if (score.status !== "scored" || score.contributions.length === 0) return null;
            return (
              <div key={factor}>
                <p className="text-white/40">{FACTOR_LABELS[factor]} contributions:</p>
                <ul className="list-inside list-disc">
                  {score.contributions.map((c) => (
                    <li key={c.key}>
                      {c.label}: {c.rawValue.toFixed(0)} (weight {c.weight.toFixed(2)}) — {c.detail}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div>
            <button
              type="button"
              onClick={handleExport}
              className="text-white/40 underline decoration-dotted underline-offset-2 hover:text-white/60"
            >
              Export prediction snapshot (dev, redacted)
            </button>
            {exported ? (
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px] whitespace-pre-wrap text-white/60">
                {exported}
              </pre>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DataCoverageLine({ risk }: { risk: ExperimentalCommuteRiskV0 }) {
  const { dataCoverage } = risk;
  return (
    <div className="mt-3">
      <p className="text-white/50">Data coverage:</p>
      <p className="text-white/80">
        Weather: {dataCoverage.weatherModelsAvailable > 0 ? `${dataCoverage.weatherModelsAvailable} ${pluralize(dataCoverage.weatherModelsAvailable, "model")}, ${dataCoverage.weather}` : dataCoverage.weather}
        {" · "}Traffic: {dataCoverage.traffic}
        {" · "}Road events: {dataCoverage.roadEvents}
        {" · "}Transit: {dataCoverage.transit}
      </p>
    </div>
  );
}

function FactorsSection({ risk }: { risk: ExperimentalCommuteRiskV0 }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-white/50">Factors</p>
      {FACTOR_ORDER.map((factor) => (
        <FactorRow key={factor} factor={factor} score={risk.factors[factor]} />
      ))}
    </div>
  );
}

export function RiskPreview({ state }: { state: RiskPreviewState }) {
  const { risk } = state;

  if (risk.predictionStatus === "insufficient-data") {
    return (
      <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
          Risk model preview — experimental V0
        </p>

        <p className="text-base font-semibold text-white/90">Risk estimate unavailable</p>
        <p className="mt-1 text-white/60">
          There isn&apos;t enough evidence for this trip to produce a defensible risk index — this is not the same as
          a low-risk result.
        </p>
        {risk.sufficiency.reasons.length > 0 ? (
          <ul className="mt-2 list-inside list-disc text-white/70">
            {risk.sufficiency.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}

        <FactorsSection risk={risk} />
        <DataCoverageLine risk={risk} />
        <DevDetail state={state} />

        <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-white/30">
          Experimental V0 heuristic model — not validated against real commute outcomes yet.
        </p>
      </div>
    );
  }

  return (
    <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
        Risk model preview — experimental V0
      </p>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-white">{risk.overallIndex}</span>
        <span className="text-white/40">/ 100</span>
        <span className="ml-1 text-white/70">{risk.label}</span>
      </div>
      <p className="mt-1 text-[11px] text-white/40">
        Experimental disruption index — not a probability. This does not mean a &ldquo;{risk.overallIndex}% chance&rdquo;
        of anything; it reflects relative disruption severity under WinterRoute&apos;s transparent V0 heuristic model.
      </p>

      {risk.predictionStatus === "limited-data" ? (
        <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[11px] text-amber-200/80">
          <p className="font-medium">Based on incomplete data.</p>
          {risk.sufficiency.reasons.length > 0 ? (
            <ul className="mt-1 list-inside list-disc">
              {risk.sufficiency.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <FactorsSection risk={risk} />

      {risk.dominantFactors.length > 0 ? (
        <div className="mt-3">
          <p className="text-white/50">Main contributors:</p>
          <p className="text-white/80">{risk.dominantFactors.join(", ")}</p>
        </div>
      ) : null}

      <DataCoverageLine risk={risk} />

      {risk.explanation.length > 0 ? (
        <div className="mt-3">
          <p className="text-white/50">Why:</p>
          {risk.explanation.map((sentence, index) => (
            <p key={index} className="mt-0.5 text-white/80">
              {sentence}
            </p>
          ))}
        </div>
      ) : null}

      <DevDetail state={state} />

      <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-white/30">
        Experimental V0 heuristic model — not validated against real commute outcomes yet. Not a prediction of exact
        delay, and not a recommendation.
      </p>
    </div>
  );
}
