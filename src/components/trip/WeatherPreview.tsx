"use client";

import { useState } from "react";
import type { RouteWeatherAnalysis } from "@/lib/weather/types";
import { summarizeRouteWeatherOverview, describeSampleLocations } from "@/lib/weather/overview";
import {
  formatPrecipitationSummary,
  formatSnowSummary,
  formatTemperatureRangeC,
  formatWindRangeKmh,
} from "@/lib/weather/format";
import { isWeatherDataUnavailable } from "@/lib/weather/analyzeRouteWeather";
import { formatTripTime } from "@/lib/trip/format";

export type WeatherPreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; analysis: RouteWeatherAnalysis };

function AlertsLine({ analysis }: { analysis: RouteWeatherAnalysis }) {
  if (analysis.alertStatus === "unavailable") {
    return <p className="mt-1 text-white/80">Official alerts: status unavailable</p>;
  }
  if (analysis.alerts.length === 0) {
    return <p className="mt-1 text-white/80">Official alerts: none</p>;
  }
  return (
    <p className="mt-1 text-white/80">
      Official alerts: {analysis.alerts.map((a) => a.title).join(", ")}
    </p>
  );
}

function ModelDetail({ analysis }: { analysis: RouteWeatherAnalysis }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-white/50 underline decoration-dotted underline-offset-2 hover:text-white/80"
      >
        {open ? "Hide model details" : "Show model details"}
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-3">
          {analysis.samples.map((sample) => (
            <div key={sample.point.id} className="text-xs text-white/60">
              <p className="font-medium text-white/80">
                {sample.point.label} · {formatTripTime(sample.point.estimatedTime)}
              </p>
              {sample.forecasts.length === 0 ? (
                <p className="text-white/40">No model data for this point.</p>
              ) : (
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {sample.forecasts.map((forecast) => (
                    <li key={forecast.source.displayName}>
                      {forecast.source.displayName}:{" "}
                      {forecast.temperatureC !== undefined ? `${forecast.temperatureC}°C` : "—"}
                      {", "}
                      {forecast.precipitationMm !== undefined ? `${forecast.precipitationMm}mm precip` : "precip —"}
                      {", "}
                      {forecast.snowfallCm !== undefined ? `${forecast.snowfallCm}cm snow` : "snow —"}
                      {forecast.weatherDescription ? ` · ${forecast.weatherDescription}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WeatherPreview({ state }: { state: WeatherPreviewState }) {
  if (state.status === "loading") {
    return (
      <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        Checking the forecast…
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
  const unavailable = isWeatherDataUnavailable(analysis);
  const overview = summarizeRouteWeatherOverview(analysis);
  const sampleTrail = describeSampleLocations(analysis);
  const partiallyUnavailable = analysis.modelStatus.some((m) => !m.succeeded) && !unavailable;

  return (
    <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
        Weather preview — risk model not connected yet
      </p>

      {analysis.usedNominalBaselineTimeline ? (
        <p className="mb-2 text-xs text-white/40">
          Based on a nominal baseline timeline for this arrival time — not a recommended departure.
        </p>
      ) : null}

      {unavailable ? (
        <p className="text-white/80">Weather data is currently unavailable for this trip.</p>
      ) : (
        <>
          <p className="text-white/80">
            <span className="text-white/50">Temperature: </span>
            {formatTemperatureRangeC(overview.temperatureRangeC)}
          </p>
          <p className="mt-1 text-white/80">
            <span className="text-white/50">Precipitation: </span>
            {formatPrecipitationSummary(overview.precipitation)}
          </p>
          <p className="mt-1 text-white/80">
            <span className="text-white/50">Snow: </span>
            {formatSnowSummary(overview.snow)}
          </p>
          <p className="mt-1 text-white/80">
            <span className="text-white/50">Wind: </span>
            {formatWindRangeKmh(overview.windRangeKmh)}
          </p>
          <AlertsLine analysis={analysis} />
          {sampleTrail ? <p className="mt-1 text-white/80">Sample locations: {sampleTrail}</p> : null}

          {partiallyUnavailable ? (
            <p className="mt-2 text-xs text-amber-200/80">
              Available models: {analysis.modelStatus.filter((m) => m.succeeded).length}/
              {analysis.modelStatus.length}
            </p>
          ) : null}

          <ModelDetail analysis={analysis} />
        </>
      )}

      <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-white/30">
        Weather forecast data: Open-Meteo.com (CC BY 4.0) — models: Environment and Climate Change Canada
        (HRDPS/RDPS), ECMWF, NOAA. Official alerts: Environment and Climate Change Canada.
      </p>
    </div>
  );
}
