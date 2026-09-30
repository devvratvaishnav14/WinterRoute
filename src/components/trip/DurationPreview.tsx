"use client";

import { useState } from "react";
import { formatAdditionalTime, formatDurationMinutes, formatDurationRange } from "@/lib/duration/format";
import type { ExpectedCommuteDurationV0 } from "@/lib/duration/types";

export type DurationPreviewState = { status: "success"; duration: ExpectedCommuteDurationV0 };

function DevDetail({ duration }: { duration: ExpectedCommuteDurationV0 }) {
  const [open, setOpen] = useState(false);

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
          <p>Model version: {duration.modelVersion}</p>
          <p>Config fingerprint: {duration.configFingerprint}</p>
          <p>Timing basis: {duration.timingBasis}</p>
          <p>Prediction status: {duration.predictionStatus}</p>
          <p>
            Baseline: {formatDurationMinutes(duration.baselineDurationMinutes)} · Central estimate:{" "}
            {formatDurationMinutes(duration.centralEstimateMinutes)}
          </p>
          <p>
            Uncertainty: -{Math.round(duration.uncertaintyBufferMinutes.lower)} / +
            {Math.round(duration.uncertaintyBufferMinutes.upper)} min
          </p>
          <div>
            <p className="text-white/40">Contributions:</p>
            <ul className="list-inside list-disc">
              {duration.contributingDelayFactors.map((c) => (
                <li key={c.key}>
                  {c.label}: central {c.centralMinutes.toFixed(1)} min, range [{c.lowerMinutes.toFixed(1)},{" "}
                  {c.upperMinutes.toFixed(1)}] ({c.provenance}, applies to {c.appliesTo})
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DurationPreview({ state }: { state: DurationPreviewState }) {
  const { duration } = state;

  if (duration.predictionStatus === "insufficient-data") {
    return (
      <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
          Expected commute preview — experimental V0
        </p>
        <p className="text-base font-semibold text-white/90">Duration estimate unavailable</p>
        {duration.statusReasons.length > 0 ? (
          <ul className="mt-2 list-inside list-disc text-white/70">
            {duration.statusReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        <DevDetail duration={duration} />
      </div>
    );
  }

  return (
    <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
        Expected commute preview — experimental V0
      </p>

      <p className="text-white/50">
        Typical journey: <span className="text-white/80">{formatDurationMinutes(duration.baselineDurationMinutes)}</span>
      </p>
      <p className="mt-1 text-white/50">
        Expected journey:{" "}
        <span className="text-lg font-semibold text-white">
          {formatDurationRange(duration.lowerBoundMinutes, duration.upperBoundMinutes)}
        </span>
      </p>
      <p className="mt-1 text-white/50">
        Expected additional time:{" "}
        <span className="text-white/80">
          {formatAdditionalTime(duration.baselineDurationMinutes, duration.lowerBoundMinutes, duration.upperBoundMinutes)}
        </span>
      </p>

      {duration.predictionStatus === "route-disrupted" ? (
        <div className="mt-2 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">
          <p className="font-medium">This itinerary appears disrupted.</p>
          {duration.statusReasons.map((reason) => (
            <p key={reason} className="mt-0.5">
              {reason}
            </p>
          ))}
        </div>
      ) : duration.predictionStatus === "limited-data" ? (
        <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[11px] text-amber-200/80">
          <p className="font-medium">Based on incomplete data.</p>
          {duration.statusReasons.map((reason) => (
            <p key={reason} className="mt-0.5">
              {reason}
            </p>
          ))}
        </div>
      ) : null}

      {duration.explanation.length > 0 ? (
        <div className="mt-3">
          <p className="text-white/50">Why:</p>
          {duration.explanation.map((sentence, index) => (
            <p key={index} className="mt-0.5 text-white/80">
              {sentence}
            </p>
          ))}
        </div>
      ) : null}

      <DevDetail duration={duration} />

      <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-white/30">
        Experimental V0 heuristic model — a separate prediction from the risk index above, not derived from it. Not
        validated against real commute outcomes yet, and not a recommended departure time.
      </p>
    </div>
  );
}
