"use client";

import { useState } from "react";
import type { RouteSegment } from "@/lib/route/types";
import type { WeatherPreviewState } from "@/components/trip/WeatherPreview";
import type { TrafficPreviewState } from "@/components/trip/TrafficPreview";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";

type SourceCoverage = { label: string; detail: string; limited: boolean };

function weatherCoverage(state: WeatherPreviewState | null): SourceCoverage {
  if (!state || state.status === "loading") return { label: "Weather", detail: "Checking…", limited: false };
  if (state.status === "error") return { label: "Weather", detail: "Unavailable", limited: true };
  const modelCount = state.analysis.modelStatus.filter((model) => model.succeeded).length;
  if (modelCount === 0) return { label: "Weather", detail: "Unavailable", limited: true };
  return { label: "Weather", detail: `${modelCount} forecast model${modelCount === 1 ? "" : "s"}`, limited: false };
}

function trafficCoverage(state: TrafficPreviewState | null, hasDrive: boolean): SourceCoverage | null {
  if (!hasDrive) return null;
  if (!state || state.status === "loading") return { label: "Traffic", detail: "Checking…", limited: false };
  if (state.status === "error") return { label: "Traffic", detail: "Unavailable", limited: true };
  if (state.result.trafficAnalysis.status === "unavailable") return { label: "Traffic", detail: "Unavailable", limited: true };
  return { label: "Traffic", detail: "Live conditions", limited: false };
}

function transitCoverage(state: TransitPreviewState | null, hasTransit: boolean): SourceCoverage | null {
  if (!hasTransit) return null;
  if (!state || state.status === "loading") return { label: "Transit", detail: "Checking…", limited: false };
  if (state.status === "error") return { label: "Transit", detail: "Unavailable", limited: true };
  const { analysis } = state;
  if (analysis.status === "unavailable") return { label: "Transit", detail: "Unavailable", limited: true };
  const hasRealtime = analysis.transitSegments.some((segment) => segment.status === "matched-with-realtime");
  if (hasRealtime) return { label: "Transit", detail: "Scheduled + realtime", limited: false };
  return { label: "Transit", detail: "Scheduled (no realtime yet)", limited: false };
}

function roadEventCoverage(state: TrafficPreviewState | null): SourceCoverage {
  if (!state || state.status !== "success" || state.result.roadEventStatus !== "ok") {
    return { label: "Road events", detail: "Not checked", limited: false };
  }
  return { label: "Road events", detail: "Checked", limited: false };
}

/**
 * Coverage summary is derived purely from already-computed preview
 * statuses (loading/error/success + domain status fields) — no new
 * data-quality judgment is made here beyond "did a source come back".
 * A future/no-realtime-yet transit schedule is treated as normal
 * coverage, not a limitation, per product direction.
 */
export function DataCoverageBadge({
  segments,
  weatherState,
  trafficState,
  transitState,
}: {
  segments: RouteSegment[];
  weatherState: WeatherPreviewState | null;
  trafficState: TrafficPreviewState | null;
  transitState: TransitPreviewState | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasDrive = segments.some((s) => s.mode === "drive");
  const hasTransit = segments.some((s) => s.mode === "bus" || s.mode === "rail");

  const sources = [
    weatherCoverage(weatherState),
    trafficCoverage(trafficState, hasDrive),
    transitCoverage(transitState, hasTransit),
    roadEventCoverage(trafficState),
  ].filter((s): s is SourceCoverage => s !== null);

  const limited = sources.some((s) => s.limited);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
          limited
            ? "border-amber-300/25 bg-amber-300/10 text-amber-100 hover:border-amber-300/40"
            : "border-emerald-300/20 bg-emerald-300/5 text-emerald-200/90 hover:border-emerald-300/35"
        }`}
      >
        Data coverage: {limited ? "Limited data" : "Good"}
      </button>
      {expanded ? (
        <ul className="mt-2 space-y-1 text-xs text-white/60">
          {sources.map((source) => (
            <li key={source.label} className="flex justify-between gap-4">
              <span>{source.label}</span>
              <span className={source.limited ? "text-amber-200/80" : "text-white/62"}>{source.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
