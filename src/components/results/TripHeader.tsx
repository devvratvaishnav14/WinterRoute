import type { Route } from "@/lib/route/types";
import type { TripRequest } from "@/lib/trip/types";
import { formatRelativeDayLabel, formatTripTime, TRANSPORT_MODE_LABELS } from "@/lib/trip/format";

/**
 * Compact trip context at the top of the results experience — purely
 * presentational, formatting values the caller already has. No domain
 * computation happens here.
 */
export function TripHeader({
  tripRequest,
  route,
  onEditTrip,
}: {
  tripRequest: TripRequest;
  route: Route;
  onEditTrip: () => void;
}) {
  const preferenceLabel = tripRequest.timePreference === "arriveBy" ? "Arrive by" : "Leave at";

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {/* No card backdrop here — sits directly over the weather scene — so a subtle text-shadow keeps it readable over a bright/pale scene, never just relying on the scrim alone. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.5)] sm:text-lg">
          <span className="max-w-[45vw] truncate sm:max-w-xs" title={route.origin.label}>
            {route.origin.label}
          </span>
          <span aria-hidden className="text-white/45">
            →
          </span>
          <span className="max-w-[45vw] truncate sm:max-w-xs" title={route.destination.label}>
            {route.destination.label}
          </span>
        </div>
        <p className="mt-1 text-sm text-white/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
          {formatRelativeDayLabel(tripRequest.dateTime)} · {preferenceLabel} {formatTripTime(tripRequest.dateTime)} ·{" "}
          {TRANSPORT_MODE_LABELS[tripRequest.mode]}
        </p>
      </div>

      <button
        type="button"
        onClick={onEditTrip}
        className="shrink-0 rounded-full border border-white/20 bg-white/[0.06] px-4 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm transition-colors hover:border-white/35 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      >
        Edit trip
      </button>
    </div>
  );
}
