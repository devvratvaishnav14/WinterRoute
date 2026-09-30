import type { Route } from "@/lib/route/types";
import { describeRouteModes, formatDistanceMeters, formatDurationMinutes } from "@/lib/route/format";

export type RoutePreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; route: Route; providerWarnings: string[] };

/**
 * Shows a *factual* route preview — no weather, traffic, risk score, or
 * recommended departure. Those belong to a later prediction stage (see
 * docs/architecture.md); this exists only to verify the routing
 * foundation, hence the explicit "prediction model not connected yet"
 * label.
 */
export function RoutePreview({ state }: { state: RoutePreviewState }) {
  if (state.status === "loading") {
    return (
      <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        Calculating your route…
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

  const { route, providerWarnings } = state;
  const routeLabel = describeRouteModes(route.segments);

  return (
    <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
        Route preview — prediction model not connected yet
      </p>
      <p className="text-base font-medium text-white">
        {route.origin.label} → {route.destination.label}
      </p>
      {route.baselineDurationMinutes != null ? (
        <p className="mt-2 text-white/80">
          Typical journey: {formatDurationMinutes(route.baselineDurationMinutes)}
        </p>
      ) : null}
      {route.totalDistanceMeters != null ? (
        <p className="mt-1 text-white/80">Distance: {formatDistanceMeters(route.totalDistanceMeters)}</p>
      ) : null}
      {routeLabel ? <p className="mt-1 text-white/80">Route: {routeLabel}</p> : null}

      {providerWarnings.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
          {providerWarnings.map((warning) => (
            <p key={warning} className="text-xs text-white/40">
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
