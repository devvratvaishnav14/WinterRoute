"use client";

import type { RouteTrafficResult } from "@/lib/traffic/types";
import { computeConditionBreakdown, formatTrafficDelay } from "@/lib/traffic/format";
import { formatTripTime } from "@/lib/trip/format";

export type TrafficPreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; result: RouteTrafficResult };

function TrafficAnalysisSection({ result }: { result: RouteTrafficResult }) {
  const { trafficAnalysis } = result;

  if (trafficAnalysis.status === "not-applicable") {
    return <p className="text-white/80">{trafficAnalysis.reason}</p>;
  }

  if (trafficAnalysis.status === "unavailable") {
    return <p className="text-white/80">{trafficAnalysis.reason}</p>;
  }

  const { analysis } = trafficAnalysis;
  const breakdown = computeConditionBreakdown(analysis.intervals);

  return (
    <>
      {analysis.isNominalDepartureTime ? (
        <p className="mb-2 text-xs text-white/40">
          Based on a nominal baseline timeline for this arrival time — not a recommended departure.
        </p>
      ) : null}
      {analysis.recency === "future" ? (
        <p className="mb-2 text-xs text-white/40">
          This far ahead, traffic reflects typical patterns for this time rather than live conditions.
        </p>
      ) : null}

      <p className="text-white/80">
        <span className="text-white/50">Baseline/reference: </span>
        {analysis.referenceBaselineDurationMinutes} min
      </p>
      <p className="mt-1 text-white/80">
        <span className="text-white/50">Google traffic-aware: </span>
        {analysis.trafficAwareDurationMinutes} min
      </p>
      <p className="mt-1 text-white/80">
        <span className="text-white/50">Traffic-related difference: </span>
        {formatTrafficDelay(analysis.trafficDelayMinutes)}
      </p>

      {breakdown ? (
        <div className="mt-2">
          <p className="text-white/50">Route traffic:</p>
          <p className="text-white/80">
            Normal: {breakdown.normalPercent}% · Slow: {breakdown.slowPercent}% · Traffic jam:{" "}
            {breakdown.trafficJamPercent}%
          </p>
        </div>
      ) : null}
    </>
  );
}

function RoadEventsSection({ result }: { result: RouteTrafficResult }) {
  if (result.roadEventStatus === "unavailable") {
    return <p className="mt-2 text-white/80">Road events: status unavailable</p>;
  }

  if (result.roadEvents.length === 0) {
    return (
      <div className="mt-2">
        <p className="text-white/80">Road events: no relevant DriveBC events found</p>
        <p className="mt-0.5 text-[11px] text-white/30">
          DriveBC doesn&apos;t cover every local street — this isn&apos;t a guarantee the route is incident-free.
        </p>
      </div>
    );
  }

  const [first, ...rest] = result.roadEvents;

  return (
    <div className="mt-2">
      <p className="text-white/80">
        Road events: {result.roadEvents.length} relevant DriveBC event{result.roadEvents.length > 1 ? "s" : ""}
      </p>
      <div className="mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <p className="text-white/80">{first.headline}</p>
        {first.updatedAt ? (
          <p className="text-[11px] text-white/40">Updated {formatTripTime(first.updatedAt)}</p>
        ) : null}
        {first.timeRelevance === "unknown" ? (
          <p className="mt-0.5 text-[11px] text-amber-200/70">Event timing unconfirmed for this trip time.</p>
        ) : null}
      </div>
      {rest.length > 0 ? <p className="mt-1 text-[11px] text-white/30">+{rest.length} more nearby</p> : null}
    </div>
  );
}

export function TrafficPreview({ state }: { state: TrafficPreviewState }) {
  if (state.status === "loading") {
    return (
      <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        Checking traffic…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200">
        {state.message}
      </div>
    );
  }

  return (
    <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
        Traffic preview — prediction model not connected yet
      </p>

      <TrafficAnalysisSection result={state.result} />
      <RoadEventsSection result={state.result} />

      <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-white/30">
        Traffic data: Google Routes. Road events: DriveBC (Government of British Columbia), Open511.
      </p>
    </div>
  );
}
