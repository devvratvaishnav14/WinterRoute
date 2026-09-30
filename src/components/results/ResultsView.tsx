"use client";

import { useState } from "react";
import type { Route } from "@/lib/route/types";
import type { TripRequest } from "@/lib/trip/types";
import type { RoutePreviewState } from "@/components/trip/RoutePreview";
import type { WeatherPreviewState } from "@/components/trip/WeatherPreview";
import type { TrafficPreviewState } from "@/components/trip/TrafficPreview";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";
import type { RiskPreviewState } from "@/components/trip/RiskPreview";
import type { DurationPreviewState } from "@/components/trip/DurationPreview";
import type { TimingPreviewState } from "@/components/trip/TimingPreview";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { CommutePreviewControls } from "@/components/preview/CommutePreviewControls";
import { usePreviewPlayback } from "@/components/preview/usePreviewPlayback";
import { TripHeader } from "./TripHeader";
import { TimingHero } from "./TimingHero";
import { JourneyDuration } from "./JourneyDuration";
import { RiskSummary } from "./RiskSummary";
import { WhySection } from "./WhySection";
import { RouteConditions } from "./RouteConditions";
import { TripItinerary } from "./TripItinerary";
import { DataCoverageBadge } from "./DataCoverageBadge";
import { DetailsDrawer } from "./DetailsDrawer";
import { RouteMap } from "@/components/map/RouteMap";

function mostRecentAnalysisTime(
  weatherState: WeatherPreviewState | null,
  trafficState: TrafficPreviewState | null,
  transitState: TransitPreviewState | null,
): Date {
  const times = [
    weatherState?.status === "success" ? weatherState.analysis.analyzedAt : null,
    trafficState?.status === "success" && trafficState.result.trafficAnalysis.status === "analyzed"
      ? trafficState.result.trafficAnalysis.analysis.analyzedAt
      : null,
    transitState?.status === "success" ? transitState.analysis.analyzedAt : null,
  ].filter((t): t is Date => t !== null);
  if (times.length === 0) return new Date();
  return new Date(Math.max(...times.map((t) => t.getTime())));
}

function timeAgoLabel(date: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "Updated just now";
  if (minutes === 1) return "Updated 1 min ago";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `Updated ${hours} hr${hours === 1 ? "" : "s"} ago`;
}

/**
 * The single consolidated results experience — a pure presentational
 * composition of already-computed domain results. Renders once
 * `riskState`/`durationState`/`timingState` are all populated (they're
 * set synchronously together in `TripForm`, so their presence is the
 * "results are ready" signal).
 *
 * Hierarchy (top to bottom, and the mobile stacking order): Timing hero
 * -> expected journey + disruption -> Route Conditions (prominent, full
 * width) -> map + itinerary -> Why/What to know -> data coverage ->
 * details. Route Conditions intentionally sits BEFORE the map — see
 * docs/architecture.md "Route Conditions architecture."
 */
export function ResultsView({
  tripRequest,
  route,
  providerWarnings,
  routeState,
  weatherState,
  trafficState,
  transitState,
  riskState,
  durationState,
  timingState,
  onEditTrip,
}: {
  tripRequest: TripRequest;
  route: Route;
  providerWarnings: string[];
  routeState: RoutePreviewState | null;
  weatherState: WeatherPreviewState | null;
  trafficState: TrafficPreviewState | null;
  transitState: TransitPreviewState | null;
  riskState: RiskPreviewState | null;
  durationState: DurationPreviewState | null;
  timingState: TimingPreviewState | null;
  onEditTrip: () => void;
}) {
  // Lightweight, page-local highlight state shared between the map and
  // the itinerary — tapping a step brightens its map segment and mutes
  // the rest; tapping a map segment does the reverse. No navigation
  // state beyond "which segment id is currently highlighted."
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);

  // "Preview my commute" — visual-only, drives the SAME highlight state
  // as manual map/itinerary clicks (below) while it's running. Manual
  // selection is intentionally disabled during playback/pause rather
  // than trying to reconcile two competing "what's active" sources —
  // the simpler, more robust choice (see `usePreviewPlayback`'s doc
  // comment). Stopping (or finishing) hands control straight back.
  const reducedMotion = useReducedMotion();
  const preview = usePreviewPlayback(route, reducedMotion);
  const previewLive = preview.status === "playing" || preview.status === "paused";
  const effectiveHighlight = previewLive ? preview.activeSegmentId : highlightedSegmentId;

  // A transit route has a genuinely useful multi-step itinerary worth
  // dedicating side-by-side width to; a single-step walk/drive/cycle
  // route only ever produces one compact summary row (see
  // `TripItinerary`'s doc comment), so reserving the same fixed side
  // column for it would waste map width on an almost-empty card.
  const hasTransit = route.segments.some((s) => s.mode === "bus" || s.mode === "rail");

  return (
    <div className="animate-results-in flex flex-col gap-6">
      <TripHeader tripRequest={tripRequest} route={route} onEditTrip={onEditTrip} />

      <div className="rounded-2xl border border-white/15 bg-white/[0.09] p-5 backdrop-blur-lg sm:p-6">
        <TimingHero state={timingState} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur-lg">
          <JourneyDuration state={durationState} />
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur-lg">
          <RiskSummary state={riskState} />
        </div>
      </div>

      <RouteConditions route={route} weatherState={weatherState} trafficState={trafficState} transitState={transitState} />

      <CommutePreviewControls
        status={preview.status}
        announcement={preview.announcement}
        canPlay={preview.canPlay}
        onStart={preview.start}
        onPause={preview.pause}
        onResume={preview.resume}
        onStop={preview.stop}
        onReplay={preview.replay}
      />

      {hasTransit ? (
        <div className="lg:grid lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-6">
          <RouteMap
            route={route}
            transitState={transitState}
            highlightedSegmentId={effectiveHighlight}
            onSelectSegment={previewLive ? undefined : setHighlightedSegmentId}
            previewHandleRef={preview.previewHandleRef}
          />
          <div className="mt-4 lg:mt-0">
            <TripItinerary
              route={route}
              transitState={transitState}
              trafficState={trafficState}
              highlightedStepId={effectiveHighlight}
              onSelectStep={previewLive ? undefined : setHighlightedSegmentId}
            />
          </div>
        </div>
      ) : (
        // No side column reserved for a single-line summary — the map
        // stays full width and dominant, with the compact route summary
        // sitting beneath it instead of squeezed into a narrow rail.
        <div className="flex flex-col gap-4">
          <RouteMap
            route={route}
            transitState={transitState}
            highlightedSegmentId={effectiveHighlight}
            onSelectSegment={previewLive ? undefined : setHighlightedSegmentId}
            previewHandleRef={preview.previewHandleRef}
          />
          <TripItinerary
            route={route}
            transitState={transitState}
            trafficState={trafficState}
            highlightedStepId={effectiveHighlight}
            onSelectStep={previewLive ? undefined : setHighlightedSegmentId}
          />
        </div>
      )}

      <WhySection timingState={timingState} durationState={durationState} weatherState={weatherState} route={route} />

      <DataCoverageBadge
        segments={route.segments}
        weatherState={weatherState}
        trafficState={trafficState}
        transitState={transitState}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/45">
        <span>{timeAgoLabel(mostRecentAnalysisTime(weatherState, trafficState, transitState))}</span>
      </div>

      <DetailsDrawer
        route={route}
        providerWarnings={providerWarnings}
        routeState={routeState}
        weatherState={weatherState}
        trafficState={trafficState}
        transitState={transitState}
        riskState={riskState}
        durationState={durationState}
        timingState={timingState}
      />
    </div>
  );
}
