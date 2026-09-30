import type { Route } from "@/lib/route/types";
import type { TimePreference } from "@/lib/trip/types";
import type { TrafficDataRecency } from "./types";

/**
 * WinterRoute's own pragmatic threshold for "close enough that Google's
 * traffic-aware estimate reflects genuinely current conditions" — not a
 * documented Google cutoff (their docs don't publish one). Chosen
 * conservatively: live traffic data is only meaningfully "live" a few
 * hours out; beyond that it's realistically a historical/pattern-based
 * estimate for that future time regardless of what Google's internals do
 * — see docs/architecture.md "Future vs near-term traffic."
 */
export const NEAR_TERM_THRESHOLD_HOURS = 6;

export interface TrafficDepartureTime {
  departureTime: Date;
  isNominal: boolean;
}

/**
 * Resolves the single departure instant a DRIVE traffic analysis is
 * queried for. Unlike weather's per-segment timeline, a DRIVE route is
 * always exactly one segment (Google never mixes DRIVE with other modes
 * in a single response), so this only ever needs one instant, not a
 * propagated timeline.
 *
 * "Leave at": the user's chosen time, used as-is. "Arrive by": WinterRoute
 * still does not compute a recommended departure (see
 * docs/architecture.md) — for traffic *analysis only*, a nominal baseline
 * departure (`arrival time - baseline duration`) is derived and flagged
 * (`isNominal: true`), mirroring the identical concept already used for
 * weather sampling (`lib/weather/timeline.ts`).
 */
export function resolveTrafficDepartureTime(
  route: Route,
  timePreference: TimePreference,
  tripDateTime: Date,
): TrafficDepartureTime | null {
  if (timePreference === "leaveAt") {
    return { departureTime: tripDateTime, isNominal: false };
  }

  if (route.baselineDurationMinutes == null) return null;

  const nominalDepartureTime = new Date(tripDateTime.getTime() - route.baselineDurationMinutes * 60_000);
  return { departureTime: nominalDepartureTime, isNominal: true };
}

export function classifyTrafficRecency(departureTime: Date, now: Date): TrafficDataRecency {
  const hoursUntilDeparture = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursUntilDeparture <= NEAR_TERM_THRESHOLD_HOURS ? "near-term" : "future";
}
