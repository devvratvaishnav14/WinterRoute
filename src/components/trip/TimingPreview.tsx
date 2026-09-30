"use client";

import { useState } from "react";
import { vancouverCalendarDate } from "@/lib/time/vancouverTime";
import { formatTripTime } from "@/lib/trip/format";
import type { CommuteTimingRecommendationV0 } from "@/lib/timing/types";

export type TimingPreviewState = { status: "success"; timing: CommuteTimingRecommendationV0 };

/** Appends "(previous day)"/"(next day)" when a time's Vancouver calendar date differs from a reference date — e.g. a Leave-By time that falls before midnight for an early-morning arrival target. */
function formatDayAwareTime(date: Date, referenceDate: Date): string {
  const time = formatTripTime(date);
  const dateDay = vancouverCalendarDate(date);
  const referenceDay = vancouverCalendarDate(referenceDate);
  if (dateDay === referenceDay) return time;
  return date.getTime() < referenceDate.getTime() ? `${time} (previous day)` : `${time} (next day)`;
}

function DevDetail({ timing }: { timing: CommuteTimingRecommendationV0 }) {
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
        <div className="mt-1 space-y-1 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-white/50">
          <p>Model version: {timing.modelVersion}</p>
          <p>Config fingerprint: {timing.configFingerprint}</p>
          <p>Preference: {timing.preference}</p>
          <p>Status: {timing.status}</p>
          <p>
            Duration reference: {timing.durationPredictionReference.modelVersion} (
            {timing.durationPredictionReference.configFingerprint}), status{" "}
            {timing.durationPredictionReference.predictionStatus}
          </p>
          <p>
            Baseline {timing.durationPredictionReference.baselineDurationMinutes.toFixed(1)} min · Lower{" "}
            {timing.durationPredictionReference.lowerBoundMinutes.toFixed(1)} · Central{" "}
            {timing.durationPredictionReference.centralEstimateMinutes.toFixed(1)} · Upper{" "}
            {timing.durationPredictionReference.upperBoundMinutes.toFixed(1)}
          </p>
          {timing.arriveBy ? (
            <>
              <p>Target arrival: {timing.arriveBy.targetArrivalTime.toISOString()}</p>
              {timing.arriveBy.typicalDepartureTime ? <p>Typical departure (raw): {timing.arriveBy.typicalDepartureTime.toISOString()}</p> : null}
              {timing.arriveBy.recommendedDepartureTime ? <p>Recommended departure (capped, floored): {timing.arriveBy.recommendedDepartureTime.toISOString()}</p> : null}
              <p>Leave earlier by: {timing.arriveBy.leaveEarlierByMinutes ?? "n/a"} min</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ArriveByBody({ timing }: { timing: CommuteTimingRecommendationV0 }) {
  const { arriveBy } = timing;
  if (!arriveBy) return null;

  if (timing.status === "departure-window-missed") {
    return (
      <>
        <div className="mt-2 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">
          <p className="font-medium">The recommended departure time has already passed.</p>
        </div>
        {arriveBy.leaveNowExpectedArrivalRange ? (
          <p className="mt-2 text-white/70">
            If you leave now, the current expected arrival is approximately{" "}
            <span className="text-white/90">
              {formatTripTime(arriveBy.leaveNowExpectedArrivalRange.lower)}–{formatTripTime(arriveBy.leaveNowExpectedArrivalRange.upper)}
            </span>
            .
          </p>
        ) : arriveBy.leaveNowAnalysisStale ? (
          <p className="mt-2 text-white/50">This analysis is no longer recent enough to estimate &ldquo;leave now&rdquo; — recheck the commute using Leave At: Now.</p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <p className="text-white/50">
        Arrive by: <span className="text-white/80">{formatTripTime(arriveBy.targetArrivalTime)}</span>
      </p>
      {arriveBy.recommendedDepartureTime ? (
        <p className="mt-1 text-white/50">
          Leave by:{" "}
          <span className="text-lg font-semibold text-white">
            {formatDayAwareTime(arriveBy.recommendedDepartureTime, arriveBy.targetArrivalTime)}
          </span>
        </p>
      ) : null}
      {arriveBy.leaveEarlierByMinutes !== undefined ? (
        <p className="mt-1 text-white/50">
          {arriveBy.leaveEarlierByMinutes > 0 ? (
            <span className="text-white/80">~{arriveBy.leaveEarlierByMinutes} min earlier than typical</span>
          ) : (
            <span className="text-white/80">Same as typical departure</span>
          )}
        </p>
      ) : null}
    </>
  );
}

function LeaveAtBody({ timing }: { timing: CommuteTimingRecommendationV0 }) {
  const { leaveAt } = timing;
  if (!leaveAt) return null;

  return (
    <>
      <p className="text-white/50">
        Leave at: <span className="text-white/80">{formatTripTime(leaveAt.selectedDepartureTime)}</span>
      </p>
      {leaveAt.expectedArrivalLower && leaveAt.expectedArrivalUpper ? (
        <p className="mt-1 text-white/50">
          Expected arrival:{" "}
          <span className="text-lg font-semibold text-white">
            {formatDayAwareTime(leaveAt.expectedArrivalLower, leaveAt.selectedDepartureTime)}–
            {formatDayAwareTime(leaveAt.expectedArrivalUpper, leaveAt.selectedDepartureTime)}
          </span>
        </p>
      ) : null}
      {leaveAt.typicalArrivalTime ? (
        <p className="mt-1 text-[11px] text-white/40">Typical arrival: {formatTripTime(leaveAt.typicalArrivalTime)}</p>
      ) : null}
    </>
  );
}

export function TimingPreview({ state }: { state: TimingPreviewState }) {
  const { timing } = state;

  if (timing.status === "insufficient-data" || timing.status === "route-disrupted") {
    return (
      <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
          Timing recommendation preview — experimental V0
        </p>
        <p className="text-base font-semibold text-white/90">
          {timing.status === "route-disrupted"
            ? "Current itinerary is disrupted — a reliable departure recommendation is not available."
            : "Unable to recommend a departure time with the currently available information."}
        </p>
        {timing.statusReasons.length > 0 ? (
          <ul className="mt-2 list-inside list-disc text-white/70">
            {timing.statusReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        <DevDetail timing={timing} />
      </div>
    );
  }

  return (
    <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
        Timing recommendation preview — experimental V0
      </p>

      {timing.preference === "arriveBy" ? <ArriveByBody timing={timing} /> : <LeaveAtBody timing={timing} />}

      {timing.status === "limited-data" ? (
        <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[11px] text-amber-200/80">
          <p className="font-medium">Based on limited data.</p>
          {timing.statusReasons.map((reason) => (
            <p key={reason} className="mt-0.5">
              {reason}
            </p>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-white/50">
        Typical journey: <span className="text-white/80">{Math.round(timing.durationPredictionReference.baselineDurationMinutes)} min</span>
        {" · "}Expected journey:{" "}
        <span className="text-white/80">
          {Math.round(timing.durationPredictionReference.lowerBoundMinutes)}-{Math.round(timing.durationPredictionReference.upperBoundMinutes)} min
        </span>
      </p>

      {timing.explanation.length > 0 ? (
        <div className="mt-3">
          <p className="text-white/50">Why:</p>
          {timing.explanation.map((sentence, index) => (
            <p key={index} className="mt-0.5 text-white/80">
              {sentence}
            </p>
          ))}
        </div>
      ) : null}

      <DevDetail timing={timing} />

      <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-white/30">
        Experimental V0 — not an arrival guarantee. Leaving by the recommended time allows for the upper end of the
        currently estimated commute range, not a probability of arriving on time.
      </p>
    </div>
  );
}
