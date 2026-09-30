"use client";

import { useState } from "react";
import type { Route } from "@/lib/route/types";
import { TRANSLINK_ATTRIBUTION_TEXT } from "@/lib/transit/format";
import { RoutePreview, type RoutePreviewState } from "@/components/trip/RoutePreview";
import { WeatherPreview, type WeatherPreviewState } from "@/components/trip/WeatherPreview";
import { TrafficPreview, type TrafficPreviewState } from "@/components/trip/TrafficPreview";
import { TransitPreview, type TransitPreviewState } from "@/components/trip/TransitPreview";
import { RiskPreview, type RiskPreviewState } from "@/components/trip/RiskPreview";
import { DurationPreview, type DurationPreviewState } from "@/components/trip/DurationPreview";
import { TimingPreview, type TimingPreviewState } from "@/components/trip/TimingPreview";
import { WeatherSceneLab } from "@/components/weatherScene/WeatherSceneLab";
import { RouteNote } from "./RouteNote";

const isDev = process.env.NODE_ENV === "development";

function DevSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-[0.15em] text-white/40 uppercase">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * "How WinterRoute calculated this" — required attribution always renders
 * here (never gated), while the raw dev-preview components (full model
 * internals: config fingerprints, feature values, GTFS IDs, etc.) only
 * render in development, per the "presentation-only, don't expose
 * internals in production" instruction.
 */
export function DetailsDrawer({
  route,
  providerWarnings,
  routeState,
  weatherState,
  trafficState,
  transitState,
  riskState,
  durationState,
  timingState,
}: {
  route: Route;
  providerWarnings: string[];
  routeState: RoutePreviewState | null;
  weatherState: WeatherPreviewState | null;
  trafficState: TrafficPreviewState | null;
  transitState: TransitPreviewState | null;
  riskState: RiskPreviewState | null;
  durationState: DurationPreviewState | null;
  timingState: TimingPreviewState | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-white/15 pt-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="text-xs font-medium text-white/65 underline decoration-white/25 underline-offset-4 hover:text-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      >
        {expanded ? "Hide details" : "How WinterRoute calculated this"}
      </button>

      {expanded ? (
        <div className="mt-4 space-y-4">
          <div className="space-y-1 text-[11px] leading-relaxed text-white/55">
            <p>Weather forecast data: Open-Meteo.com (CC BY 4.0) — models: Environment and Climate Change Canada (HRDPS/RDPS), ECMWF, NOAA. Official alerts: Environment and Climate Change Canada.</p>
            <p>Traffic data: Google Routes. Road events: DriveBC (Government of British Columbia), Open511.</p>
            <p>{TRANSLINK_ATTRIBUTION_TEXT}</p>
          </div>

          {isDev ? (
            <div className="space-y-4 rounded-xl border border-dashed border-white/15 p-3">
              <p className="text-[11px] font-medium tracking-[0.15em] text-amber-200/70 uppercase">
                Development-only diagnostics
              </p>
              <DevSection title="Weather Scene Lab">
                <WeatherSceneLab />
              </DevSection>
              {providerWarnings.length > 0 ? (
                <DevSection title="Route note (raw provider warnings — no longer shown in the main results UI)">
                  <RouteNote route={route} providerWarnings={providerWarnings} />
                </DevSection>
              ) : null}
              {routeState ? (
                <DevSection title="Route">
                  <RoutePreview state={routeState} />
                </DevSection>
              ) : null}
              {weatherState ? (
                <DevSection title="Weather">
                  <WeatherPreview state={weatherState} />
                </DevSection>
              ) : null}
              {trafficState ? (
                <DevSection title="Traffic & road events">
                  <TrafficPreview state={trafficState} />
                </DevSection>
              ) : null}
              {transitState ? (
                <DevSection title="Transit">
                  <TransitPreview state={transitState} />
                </DevSection>
              ) : null}
              {riskState ? (
                <DevSection title="Risk model">
                  <RiskPreview state={riskState} />
                </DevSection>
              ) : null}
              {durationState ? (
                <DevSection title="Duration model">
                  <DurationPreview state={durationState} />
                </DevSection>
              ) : null}
              {timingState ? (
                <DevSection title="Timing model">
                  <TimingPreview state={timingState} />
                </DevSection>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
