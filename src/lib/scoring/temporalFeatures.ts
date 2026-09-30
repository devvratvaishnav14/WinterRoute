import type { Route } from "@/lib/route/types";
import { vancouverLocalHour, vancouverLocalWeekday } from "@/lib/time/vancouverTime";
import type { TemporalFeatures } from "./types";

/**
 * A weekday hour range treated as "likely rush hour," purely as
 * contextual/informational metadata. Deliberately NEVER read by any
 * scoring function — real traffic/transit providers already capture
 * actual conditions directly, and a blanket rush-hour penalty on top of
 * that would double-count the same phenomenon. See
 * docs/decisions/0008-risk-model-v0.md "No rush-hour penalty."
 */
const MORNING_RUSH_HOURS: [number, number] = [7, 9]; // inclusive start, exclusive end
const EVENING_RUSH_HOURS: [number, number] = [15, 18];

function isLikelyRushHour(hourOfDay: number, isWeekend: boolean): boolean {
  if (isWeekend) return false;
  const inMorning = hourOfDay >= MORNING_RUSH_HOURS[0] && hourOfDay < MORNING_RUSH_HOURS[1];
  const inEvening = hourOfDay >= EVENING_RUSH_HOURS[0] && hourOfDay < EVENING_RUSH_HOURS[1];
  return inMorning || inEvening;
}

/** Builds factual temporal/context features for a route. `now` is the analysis instant (injectable for tests). */
export function buildTemporalFeatures(route: Route, now: Date = new Date()): TemporalFeatures {
  const routeStartTime = route.departureTime ?? route.segments[0]?.startTime;
  const routeEndTime = route.arrivalTime ?? route.segments[route.segments.length - 1]?.endTime;

  const hourOfDay = routeStartTime ? vancouverLocalHour(routeStartTime) : vancouverLocalHour(now);
  const weekday = routeStartTime ? vancouverLocalWeekday(routeStartTime) : vancouverLocalWeekday(now);
  const isWeekend = weekday === "saturday" || weekday === "sunday";

  const forecastHorizonHours = routeStartTime
    ? Math.max(0, (routeStartTime.getTime() - now.getTime()) / (60 * 60 * 1000))
    : 0;

  const totalDurationMinutes = route.segments.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  const durationByMode = new Map<string, number>();
  for (const segment of route.segments) {
    durationByMode.set(segment.mode, (durationByMode.get(segment.mode) ?? 0) + (segment.durationMinutes ?? 0));
  }

  const transportComposition = Array.from(durationByMode.entries()).map(([mode, durationMinutes]) => ({
    mode: mode as TemporalFeatures["transportComposition"][number]["mode"],
    durationMinutes,
    durationShare: totalDurationMinutes > 0 ? durationMinutes / totalDurationMinutes : 0,
  }));

  return {
    hourOfDay,
    weekday,
    isWeekend,
    isLikelyRushHour: isLikelyRushHour(hourOfDay, isWeekend),
    forecastHorizonHours,
    baselineDurationMinutes: route.baselineDurationMinutes,
    routeStartTime,
    routeEndTime,
    segmentCount: route.segments.length,
    transportComposition,
  };
}
