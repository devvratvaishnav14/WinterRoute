import type { TranslinkAlert, TranslinkAlertEntity } from "./providers/translinkRealtime";
import type { TransitAlert, TransitAlertCause, TransitAlertEffect } from "./types";

// Confirmed via live decode against the real feed (docs/data-sources.md) —
// raw GTFS-RT enum names, mapped to WinterRoute's own casing.
const CAUSE_MAP: Record<string, TransitAlertCause> = {
  UNKNOWN_CAUSE: "unknown",
  OTHER_CAUSE: "otherCause",
  TECHNICAL_PROBLEM: "technicalProblem",
  STRIKE: "strike",
  DEMONSTRATION: "demonstration",
  ACCIDENT: "accident",
  HOLIDAY: "holiday",
  WEATHER: "weather",
  MAINTENANCE: "maintenance",
  CONSTRUCTION: "construction",
  POLICE_ACTIVITY: "policeActivity",
  MEDICAL_EMERGENCY: "medicalEmergency",
  SPECIAL_EVENT: "specialEvent",
};

const EFFECT_MAP: Record<string, TransitAlertEffect> = {
  NO_SERVICE: "noService",
  REDUCED_SERVICE: "reducedService",
  SIGNIFICANT_DELAYS: "significantDelays",
  DETOUR: "detour",
  ADDITIONAL_SERVICE: "additionalService",
  MODIFIED_SERVICE: "modifiedService",
  OTHER_EFFECT: "otherEffect",
  UNKNOWN_EFFECT: "unknown",
  STOP_MOVED: "stopMoved",
  NO_EFFECT: "noEffect",
  ACCESSIBILITY_ISSUE: "accessibilityIssue",
};

export type AlertMatchScope = "route" | "trip" | "stop" | "agency";

export interface AlertMatchCriteria {
  routeId: string;
  tripId: string;
  originStopId: string;
  destinationStopId: string;
}

/**
 * A GTFS-RT alert with no `active_period` at all is, per spec, active at
 * all times. One with periods is active only when at least one period
 * overlaps `referenceTime` — an open-ended `start` or `end` means
 * unbounded in that direction, not "no data."
 */
export function alertActivePeriodOverlaps(alert: TranslinkAlert, referenceTime: Date): boolean {
  if (alert.activePeriods.length === 0) return true;

  return alert.activePeriods.some((period) => {
    const afterStart = !period.start || referenceTime.getTime() >= period.start.getTime();
    const beforeEnd = !period.end || referenceTime.getTime() <= period.end.getTime();
    return afterStart && beforeEnd;
  });
}

/**
 * Determines whether/how one `informedEntity` selector applies to a
 * specific matched segment, most-specific field first. Deliberately
 * conservative: a stop-scoped entity is checked against exactly the
 * segment's own origin/destination stop (never "any stop on the route"),
 * and a route-scoped entity that also names a different, unrelated stop
 * is not blindly widened to the whole route. An entity with none of
 * route/trip/stop set is treated as agency/system-wide — WinterRoute only
 * ever talks to one agency (TransLink), so there's no real ambiguity to
 * resolve by cross-checking `agency_id` itself.
 */
function matchEntityScope(entity: TranslinkAlertEntity, criteria: AlertMatchCriteria): AlertMatchScope | undefined {
  if (entity.tripId) {
    return entity.tripId === criteria.tripId ? "trip" : undefined;
  }

  if (entity.stopId) {
    if (entity.stopId !== criteria.originStopId && entity.stopId !== criteria.destinationStopId) return undefined;
    if (entity.routeId && entity.routeId !== criteria.routeId) return undefined;
    return "stop";
  }

  if (entity.routeId) {
    return entity.routeId === criteria.routeId ? "route" : undefined;
  }

  return "agency";
}

function toTransitAlert(alert: TranslinkAlert, matchedOn: AlertMatchScope): TransitAlert {
  return {
    provider: "translink",
    id: alert.id,
    cause: (alert.cause ? CAUSE_MAP[alert.cause] : undefined) ?? "unknown",
    effect: (alert.effect ? EFFECT_MAP[alert.effect] : undefined) ?? "unknown",
    headerText: alert.headerText,
    descriptionText: alert.descriptionText,
    activePeriods: alert.activePeriods,
    url: alert.url,
    matchedOn,
  };
}

/**
 * Alerts relevant to one specific matched segment: matched via
 * `informedEntity` (route/trip/stop) AND requiring the alert's own active
 * period to overlap `referenceTime` (the segment's actual scheduled/
 * commute time — a future alert is legitimately relevant to a future
 * trip if its active period overlaps it; see module + `types.ts` doc
 * comments). Agency-wide (system) entities are intentionally excluded
 * here — see `matchSystemAlerts`, which is where an entity with no
 * route/trip/stop scope belongs, to avoid attaching a system-wide alert
 * to every individual segment.
 */
export function matchSegmentAlerts(
  alerts: TranslinkAlert[],
  criteria: AlertMatchCriteria,
  referenceTime: Date,
): TransitAlert[] {
  const matched: TransitAlert[] = [];

  for (const alert of alerts) {
    if (!alertActivePeriodOverlaps(alert, referenceTime)) continue;

    let bestScope: AlertMatchScope | undefined;
    const specificity: Record<AlertMatchScope, number> = { trip: 3, stop: 2, route: 1, agency: 0 };

    for (const entity of alert.informedEntities) {
      const scope = matchEntityScope(entity, criteria);
      if (!scope || scope === "agency") continue; // system-wide handled separately
      if (!bestScope || specificity[scope] > specificity[bestScope]) bestScope = scope;
    }

    if (bestScope) matched.push(toTransitAlert(alert, bestScope));
  }

  return matched;
}

/** System-wide alerts (an `informedEntity` naming no specific route/trip/stop) whose active period overlaps `referenceTime`. */
export function matchSystemAlerts(alerts: TranslinkAlert[], referenceTime: Date): TransitAlert[] {
  const matched: TransitAlert[] = [];

  for (const alert of alerts) {
    if (!alertActivePeriodOverlaps(alert, referenceTime)) continue;
    const isSystemWide = alert.informedEntities.some((e) => !e.routeId && !e.tripId && !e.stopId);
    if (isSystemWide) matched.push(toTransitAlert(alert, "agency"));
  }

  return matched;
}
