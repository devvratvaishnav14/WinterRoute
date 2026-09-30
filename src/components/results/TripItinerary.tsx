"use client";

import type { Route } from "@/lib/route/types";
import { formatDistanceMeters, formatDurationMinutes } from "@/lib/route/format";
import { buildItinerarySteps } from "@/lib/itinerary/buildItinerarySteps";
import type { ItineraryStep } from "@/lib/itinerary/types";
import type { TrafficPreviewState } from "@/components/trip/TrafficPreview";
import type { TransitPreviewState } from "@/components/trip/TransitPreview";
import { SEVERITY_LABEL, SEVERITY_STYLE } from "./routeConditionVisuals";

function StepRow({
  step,
  isHighlighted,
  onSelect,
}: {
  step: ItineraryStep;
  isHighlighted: boolean;
  onSelect?: () => void;
}) {
  const style = SEVERITY_STYLE[step.severity];
  const isTransit = step.mode === "bus" || step.mode === "rail";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${style.border} ${
        isHighlighted ? "bg-white/[0.12]" : "bg-white/[0.06] hover:bg-white/[0.08]"
      } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${isTransit ? "text-base" : "text-sm"} font-semibold ${style.accentText}`}>{step.title}</p>
          {step.subtitle ? <p className="mt-0.5 text-xs text-white/70">{step.subtitle}</p> : null}
          {step.boardStop ? <p className="mt-1 text-[11px] text-white/60">Board at {step.boardStop}</p> : null}
          {step.alightStop ? <p className="text-[11px] text-white/60">Get off at {step.alightStop}</p> : null}
          {!isTransit && (step.durationMinutes !== undefined || step.distanceMeters !== undefined) ? (
            <p className="mt-0.5 text-xs text-white/70">
              {step.durationMinutes !== undefined ? formatDurationMinutes(step.durationMinutes) : null}
              {step.durationMinutes !== undefined && step.distanceMeters !== undefined ? " · " : null}
              {step.distanceMeters !== undefined ? formatDistanceMeters(step.distanceMeters) : null}
            </p>
          ) : null}
          {step.statusSummary ? <p className="mt-0.5 text-[11px] text-white/55">{step.statusSummary}</p> : null}
        </div>
        {step.severity !== "neutral" ? (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${style.badge}`}>
            {SEVERITY_LABEL[step.severity]}
          </span>
        ) : null}
      </div>
    </button>
  );
}

/**
 * "Your route" — a compact, step-by-step itinerary built from the
 * ALREADY-COMPUTED `Route` + matched transit data, no new routing/
 * transit request. For a single-segment car/walk/cycle trip this
 * naturally renders as one compact summary row rather than a numbered
 * list — no special-casing needed, since `buildItinerarySteps` already
 * produces exactly one step for that case.
 */
export function TripItinerary({
  route,
  transitState,
  trafficState,
  highlightedStepId,
  onSelectStep,
}: {
  route: Route;
  transitState: TransitPreviewState | null;
  trafficState: TrafficPreviewState | null;
  highlightedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
}) {
  const steps = buildItinerarySteps(route, transitState, trafficState);
  if (steps.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-[0.2em] text-white/50 uppercase">Your route</p>
      <div className="flex flex-col gap-2">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} isHighlighted={highlightedStepId === step.id} onSelect={onSelectStep ? () => onSelectStep(step.id) : undefined} />
        ))}
      </div>
    </div>
  );
}
