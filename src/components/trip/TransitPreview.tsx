"use client";

import { useState } from "react";
import type { TransitAnalysis, TransitMatchQuality, TransitSegmentAnalysis } from "@/lib/transit/types";
import { formatDelaySeconds, TRANSLINK_ATTRIBUTION_TEXT } from "@/lib/transit/format";
import { formatTripTime } from "@/lib/trip/format";

export type TransitPreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; analysis: TransitAnalysis };

const MATCH_QUALITY_LABEL: Record<TransitMatchQuality, string> = {
  exact: "Exact match",
  "high-confidence": "High-confidence match",
  ambiguous: "Ambiguous match",
  unmatched: "Not matched",
};

function MatchQualityBadge({ quality }: { quality: TransitMatchQuality }) {
  return <span className="text-white/50">{MATCH_QUALITY_LABEL[quality]}</span>;
}

function SegmentDevDetail({ segment }: { segment: TransitSegmentAnalysis }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-[11px] text-white/30 underline decoration-dotted underline-offset-2 hover:text-white/50"
      >
        {open ? "Hide match details" : "Show match details"}
      </button>
      {open ? (
        <div className="mt-1 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-white/50">
          <p>Match quality: {segment.match.quality}</p>
          {segment.match.routeId ? <p>GTFS route_id: {segment.match.routeId}</p> : null}
          {segment.match.tripId ? <p>GTFS trip_id: {segment.match.tripId}</p> : null}
          {segment.match.serviceId ? <p>GTFS service_id: {segment.match.serviceId}</p> : null}
          {segment.match.ambiguousCandidateTripIds ? (
            <p>Ambiguous candidates: {segment.match.ambiguousCandidateTripIds.join(", ")}</p>
          ) : null}
          <ul className="mt-1 list-inside list-disc">
            {segment.match.evidence.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          {segment.realtime?.vehicle ? (
            <p className="mt-1">
              Vehicle observed at {formatTripTime(segment.realtime.vehicle.observedAt)} ({segment.realtime.vehicle.freshness})
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SegmentRow({ segment }: { segment: TransitSegmentAnalysis }) {
  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-white/80">
          {segment.mode === "rail" ? "Rail" : "Bus"} {segment.lineShortName}
          {segment.originStop && segment.destinationStop
            ? ` — ${segment.originStop.name} → ${segment.destinationStop.name}`
            : null}
        </p>
        <MatchQualityBadge quality={segment.match.quality} />
      </div>

      {segment.status === "unmatched" ? (
        <p className="mt-1 text-[11px] text-white/40">
          Couldn&apos;t be matched to a specific TransLink scheduled trip.
        </p>
      ) : (
        <div className="mt-1 text-white/70">
          {segment.scheduledDeparture ? (
            <p>Scheduled departure: {formatTripTime(segment.scheduledDeparture)}</p>
          ) : null}
          {segment.status === "matched-with-realtime" && segment.realtime ? (
            <p>
              Live status: {segment.realtime.tripStatus}
              {segment.realtime.departureDelaySeconds != null
                ? ` · ${formatDelaySeconds(segment.realtime.departureDelaySeconds)}`
                : ""}
            </p>
          ) : (
            <p className="text-[11px] text-white/40">
              No live update published for this trip yet — schedule only, not confirmed on-time.
            </p>
          )}
        </div>
      )}

      {segment.relevantAlerts.length > 0 ? (
        <div className="mt-1">
          {segment.relevantAlerts.map((alert) => (
            <p key={alert.id} className="text-[11px] text-amber-200/70">
              {alert.headerText}
            </p>
          ))}
        </div>
      ) : null}

      <SegmentDevDetail segment={segment} />
    </div>
  );
}

export function TransitPreview({ state }: { state: TransitPreviewState }) {
  if (state.status === "loading") {
    return (
      <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        Checking transit…
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

  const { analysis } = state;

  // Not-applicable trips (no transit segments) render nothing — mirrors
  // how the traffic preview stays silent for modes with nothing to show,
  // rather than a section explaining an absence nobody asked about.
  if (analysis.status === "not-applicable") return null;

  return (
    <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
        Transit preview — prediction model not connected yet
      </p>

      {analysis.status === "unavailable" ? (
        <p className="text-white/80">{analysis.reason}</p>
      ) : (
        <>
          {analysis.transitSegments.map((segment) => (
            <SegmentRow key={segment.routeSegmentId} segment={segment} />
          ))}

          {analysis.systemAlerts.length > 0 ? (
            <div className="mt-2">
              <p className="text-white/50">System-wide alerts:</p>
              {analysis.systemAlerts.map((alert) => (
                <p key={alert.id} className="text-[11px] text-amber-200/70">
                  {alert.headerText}
                </p>
              ))}
            </div>
          ) : null}
        </>
      )}

      <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-white/30">{TRANSLINK_ATTRIBUTION_TEXT}</p>
    </div>
  );
}
