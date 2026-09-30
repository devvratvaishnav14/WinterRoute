"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { ResolvedLocation } from "@/lib/route/types";
import type { TimePreference, TransportMode, TripRequest } from "@/lib/trip/types";
import {
  MAX_PREDICTION_WINDOW_HOURS,
  validateTripForm,
  type TripFormFieldErrors,
} from "@/lib/trip/validation";
import { computeRoute } from "@/lib/client/routesClient";
import { analyzeWeather } from "@/lib/client/weatherClient";
import { analyzeTraffic } from "@/lib/client/trafficClient";
import { analyzeTransit } from "@/lib/client/transitClient";
import { computeCommuteRisk } from "@/lib/scoring/computeCommuteRisk";
import { computeExpectedDuration } from "@/lib/duration/computeExpectedDuration";
import { computeTimingRecommendation } from "@/lib/timing/computeTimingRecommendation";
import { ApiClientError } from "@/lib/client/apiError";
import type { RecentTrip } from "@/lib/storage/recentTrips";
import {
  addRecentTrip,
  getRecentTripsServerSnapshot,
  getRecentTripsSnapshot,
  subscribeToRecentTrips,
} from "@/lib/storage/recentTrips";
import { LocationAutocomplete } from "./LocationAutocomplete";
import { TimePreferenceToggle } from "./TimePreferenceToggle";
import { TransportSelector } from "./TransportSelector";
import { RoutePreview, type RoutePreviewState } from "./RoutePreview";
import type { WeatherPreviewState } from "./WeatherPreview";
import type { TrafficPreviewState } from "./TrafficPreview";
import type { TransitPreviewState } from "./TransitPreview";
import type { RiskPreviewState } from "./RiskPreview";
import type { DurationPreviewState } from "./DurationPreview";
import type { TimingPreviewState } from "./TimingPreview";
import { RecentTrips } from "./RecentTrips";
import { LoadingSequence } from "@/components/results/LoadingSequence";
import { ResultsView } from "@/components/results/ResultsView";
import { WeatherSceneBackground } from "@/components/weatherScene/WeatherSceneBackground";
import { resolveWeatherScene } from "@/lib/weatherScene/resolveWeatherScene";
import { AboutSection } from "@/components/AboutSection";

const PAGE_LAYOUT_CLASSES = "flex min-h-screen flex-1 flex-col items-center px-4 py-12 text-white sm:px-6";

function isoDateFromNowPlusMs(offsetMs: number): string {
  const target = new Date(Date.now() + offsetMs);
  const localOffsetMs = target.getTimezoneOffset() * 60_000;
  return new Date(target.getTime() - localOffsetMs).toISOString().slice(0, 10);
}

function currentHhMm(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function TripForm() {
  const formId = useId();

  const [origin, setOrigin] = useState<ResolvedLocation | null>(null);
  const [destination, setDestination] = useState<ResolvedLocation | null>(null);
  const [timePreference, setTimePreference] = useState<TimePreference>("arriveBy");
  const [date, setDate] = useState(() => isoDateFromNowPlusMs(0));
  const [time, setTime] = useState(currentHhMm);
  const [mode, setMode] = useState<TransportMode>("bus");
  const [errors, setErrors] = useState<TripFormFieldErrors>({});
  const [submittedTripRequest, setSubmittedTripRequest] = useState<TripRequest | null>(null);
  const [routeState, setRouteState] = useState<RoutePreviewState | null>(null);
  const [weatherState, setWeatherState] = useState<WeatherPreviewState | null>(null);
  const [trafficState, setTrafficState] = useState<TrafficPreviewState | null>(null);
  const [transitState, setTransitState] = useState<TransitPreviewState | null>(null);
  const [riskState, setRiskState] = useState<RiskPreviewState | null>(null);
  const [durationState, setDurationState] = useState<DurationPreviewState | null>(null);
  const [timingState, setTimingState] = useState<TimingPreviewState | null>(null);

  const recentTrips = useSyncExternalStore(
    subscribeToRecentTrips,
    getRecentTripsSnapshot,
    getRecentTripsServerSnapshot,
  );

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const minDate = isoDateFromNowPlusMs(0);
  const maxDate = isoDateFromNowPlusMs(MAX_PREDICTION_WINDOW_HOURS * 60 * 60 * 1000);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = validateTripForm({ origin, destination, timePreference, date, time, mode });
    setErrors(result.errors);

    if (!result.valid || !result.tripRequest) {
      setRouteState(null);
      return;
    }

    const tripRequest = result.tripRequest;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSubmittedTripRequest(tripRequest);
    setRouteState({ status: "loading" });
    setWeatherState(null);
    setTrafficState(null);
    setTransitState(null);
    setRiskState(null);
    setDurationState(null);
    setTimingState(null);

    try {
      const { route, providerWarnings } = await computeRoute(
        {
          origin: tripRequest.origin,
          destination: tripRequest.destination,
          mode: tripRequest.mode,
          timePreference: tripRequest.timePreference,
          dateTime: tripRequest.dateTime,
        },
        controller.signal,
      );

      setRouteState({ status: "success", route, providerWarnings });

      addRecentTrip({
        origin: tripRequest.origin,
        destination: tripRequest.destination,
        mode: tripRequest.mode,
        timePreference: tripRequest.timePreference,
      });

      setWeatherState({ status: "loading" });
      setTrafficState({ status: "loading" });
      setTransitState({ status: "loading" });
      setRiskState(null);
      setDurationState(null);
      setTimingState(null);

      // Independent of each other — one failing shouldn't block the others.
      // Each resolves to its analysis (or `null` on failure/abort) so the
      // risk model below can use whatever data actually came back, never
      // blocking on a single source.
      const [weatherResult, trafficResultValue, transitResult] = await Promise.all([
        analyzeWeather(
          { route, timePreference: tripRequest.timePreference, dateTime: tripRequest.dateTime },
          controller.signal,
        )
          .then((analysis) => {
            setWeatherState({ status: "success", analysis });
            return analysis;
          })
          .catch((weatherError: unknown) => {
            if (weatherError instanceof Error && weatherError.name === "AbortError") return null;
            setWeatherState({
              status: "error",
              message:
                weatherError instanceof ApiClientError
                  ? weatherError.message
                  : "Something went wrong checking the weather. Please try again.",
            });
            return null;
          }),
        analyzeTraffic(
          {
            route,
            mode: tripRequest.mode,
            timePreference: tripRequest.timePreference,
            dateTime: tripRequest.dateTime,
          },
          controller.signal,
        )
          .then((result) => {
            setTrafficState({ status: "success", result });
            return result;
          })
          .catch((trafficError: unknown) => {
            if (trafficError instanceof Error && trafficError.name === "AbortError") return null;
            setTrafficState({
              status: "error",
              message:
                trafficError instanceof ApiClientError
                  ? trafficError.message
                  : "Something went wrong checking traffic. Please try again.",
            });
            return null;
          }),
        analyzeTransit({ route, mode: tripRequest.mode, dateTime: tripRequest.dateTime }, controller.signal)
          .then((analysis) => {
            setTransitState({ status: "success", analysis });
            return analysis;
          })
          .catch((transitError: unknown) => {
            if (transitError instanceof Error && transitError.name === "AbortError") return null;
            setTransitState({
              status: "error",
              message:
                transitError instanceof ApiClientError
                  ? transitError.message
                  : "Something went wrong checking transit data. Please try again.",
            });
            return null;
          }),
      ]);

      if (!controller.signal.aborted) {
        const risk = computeCommuteRisk({
          route,
          weather: weatherResult,
          traffic: trafficResultValue,
          transit: transitResult,
        });
        const duration = computeExpectedDuration({
          route,
          weather: weatherResult,
          traffic: trafficResultValue,
          transit: transitResult,
        });

        setRiskState({
          status: "success",
          risk,
          snapshotContext: {
            requestedMode: tripRequest.mode,
            timePreference: tripRequest.timePreference,
            selectedTripTime: tripRequest.dateTime,
            weather: weatherResult,
            traffic: trafficResultValue,
            transit: transitResult,
            duration,
          },
        });
        setDurationState({ status: "success", duration });

        const timing = computeTimingRecommendation({
          duration,
          preference: tripRequest.timePreference,
          targetTime: tripRequest.dateTime,
        });
        setTimingState({ status: "success", timing });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setRouteState({
        status: "error",
        message:
          error instanceof ApiClientError
            ? error.message
            : "Something went wrong calculating your route. Please try again.",
      });
    }
  }

  function handleSelectRecentTrip(trip: RecentTrip) {
    setOrigin(trip.origin);
    setDestination(trip.destination);
    setMode(trip.mode);
    setTimePreference(trip.timePreference);
    // Date/time is deliberately left as-is — never silently reuse an old one.
    setErrors({});
    setSubmittedTripRequest(null);
    setRouteState(null);
    setWeatherState(null);
    setTrafficState(null);
    setTransitState(null);
    setRiskState(null);
    setDurationState(null);
    setTimingState(null);
  }

  function handleEditTrip() {
    abortRef.current?.abort();
    setSubmittedTripRequest(null);
    setRouteState(null);
    setWeatherState(null);
    setTrafficState(null);
    setTransitState(null);
    setRiskState(null);
    setDurationState(null);
    setTimingState(null);
  }

  const isSubmitting = routeState?.status === "loading";
  const showResults = routeState?.status === "success" && riskState !== null && submittedTripRequest !== null;
  const showLoading =
    routeState?.status === "loading" || (routeState?.status === "success" && riskState === null);

  if (showLoading) {
    return (
      <div className={`atmosphere-bg ${PAGE_LAYOUT_CLASSES}`}>
        <div className="w-full max-w-md">
          <LoadingSequence
            routeState={routeState}
            weatherState={weatherState}
            trafficState={trafficState}
            transitState={transitState}
          />
        </div>
      </div>
    );
  }

  if (showResults && submittedTripRequest && routeState?.status === "success") {
    const weatherAnalysis = weatherState?.status === "success" ? weatherState.analysis : null;
    const scene = resolveWeatherScene(weatherAnalysis, {
      latitude: routeState.route.origin.latitude,
      longitude: routeState.route.origin.longitude,
    });

    return (
      <WeatherSceneBackground scene={scene} className={PAGE_LAYOUT_CLASSES}>
        <div className="w-full max-w-5xl">
          <ResultsView
            tripRequest={submittedTripRequest}
            route={routeState.route}
            providerWarnings={routeState.providerWarnings}
            routeState={routeState}
            weatherState={weatherState}
            trafficState={trafficState}
            transitState={transitState}
            riskState={riskState}
            durationState={durationState}
            timingState={timingState}
            onEditTrip={handleEditTrip}
          />
        </div>
        <AboutSection />
      </WeatherSceneBackground>
    );
  }

  return (
    <div className={`atmosphere-bg ${PAGE_LAYOUT_CLASSES}`}>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium tracking-[0.3em] text-white/50 uppercase">WinterRoute</p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Know the commute before you leave.</h1>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4">
            <div className="divide-y divide-white/10">
              <LocationAutocomplete
                id={`${formId}-origin`}
                label="Starting point"
                placeholder="e.g. SFU Burnaby"
                value={origin}
                onChange={setOrigin}
                markerVariant="origin"
                error={errors.origin}
              />
              <LocationAutocomplete
                id={`${formId}-destination`}
                label="Destination"
                placeholder="e.g. Downtown Vancouver"
                value={destination}
                onChange={setDestination}
                markerVariant="destination"
                error={errors.destination}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <TimePreferenceToggle value={timePreference} onChange={setTimePreference} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor={`${formId}-date`}
                  className="block text-[11px] font-medium tracking-wide text-white/40 uppercase"
                >
                  Date
                </label>
                <input
                  id={`${formId}-date`}
                  type="date"
                  value={date}
                  min={minDate}
                  max={maxDate}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-300 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor={`${formId}-time`}
                  className="block text-[11px] font-medium tracking-wide text-white/40 uppercase"
                >
                  Time
                </label>
                <input
                  id={`${formId}-time`}
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-300 focus:outline-none"
                />
              </div>
            </div>

            <p className={`text-xs ${errors.dateTime ? "text-rose-300" : "text-white/40"}`} role={errors.dateTime ? "alert" : undefined}>
              {errors.dateTime ??
                `WinterRoute currently predicts detailed commute conditions up to ${MAX_PREDICTION_WINDOW_HOURS} hours ahead.`}
            </p>
          </div>

          <div>
            <span className="mb-2 block text-[11px] font-medium tracking-wide text-white/40 uppercase">
              Transportation
            </span>
            <TransportSelector value={mode} onChange={setMode} />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            {isSubmitting ? "Checking…" : "Check my commute"}
          </button>

          {routeState?.status === "error" ? <RoutePreview state={routeState} /> : null}

          <RecentTrips trips={recentTrips} onSelect={handleSelectRecentTrip} />
        </form>
      </div>
      <AboutSection />
    </div>
  );
}
