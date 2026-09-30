import { haversineDistanceMeters, type LatLng } from "@/lib/geo/geometry";
import { parseVancouverLocalDateTime } from "@/lib/time/vancouverTime";
import type { Open511Event } from "./providers/driveBC";
import type { RoadEvent, RoadEventGeometry, RoadEventSeverity, RoadEventType } from "./types";

/**
 * A road event is treated as spatially relevant only within this distance
 * of the route's actual path — not "somewhere in the same city." 300m is
 * a pragmatic "on this road" threshold: close enough to catch an event on
 * the road the route travels (including some GPS/geometry imprecision),
 * far enough not to pull in events on a parallel street. Documented as a
 * deliberate, adjustable choice, not a validated value.
 */
export const ROAD_EVENT_PROXIMITY_METERS = 300;

function normalizeEventType(raw: string | undefined): RoadEventType {
  switch (raw) {
    case "INCIDENT":
      return "incident";
    case "CONSTRUCTION":
      return "construction";
    case "SPECIAL_EVENT":
      return "specialEvent";
    case "WEATHER_CONDITION":
      return "weatherCondition";
    case "ROAD_CONDITION":
      return "roadCondition";
    default:
      return "unknown";
  }
}

function normalizeSeverity(raw: string | undefined): RoadEventSeverity {
  switch (raw) {
    case "MINOR":
      return "minor";
    case "MODERATE":
      return "moderate";
    case "MAJOR":
      return "major";
    default:
      return "unknown";
  }
}

// DriveBC's `created`/`updated` timestamps carry an explicit UTC offset
// (e.g. `-07:00`) and parse correctly with a plain `new Date()`.
// `schedule.intervals`, confirmed against real live events, do NOT —
// they're naive local strings ("2026-09-09T05:00"). Parsed as
// America/Vancouver local time via the shared, DST-aware
// `parseVancouverLocalDateTime` (`lib/time/vancouverTime.ts`) — later
// reused as-is for GTFS's identical naive-local-time problem
// (`lib/transit/gtfsTime.ts`).

interface ParsedInterval {
  start: Date;
  end: Date;
}

function parseScheduleIntervals(event: Open511Event): ParsedInterval[] {
  const raw = event.schedule?.intervals ?? [];
  const parsed: ParsedInterval[] = [];

  for (const interval of raw) {
    const [startRaw, endRaw] = interval.split("/");
    const start = startRaw ? parseVancouverLocalDateTime(startRaw) : undefined;
    const end = endRaw ? parseVancouverLocalDateTime(endRaw) : undefined;
    if (start && end) parsed.push({ start, end });
  }

  return parsed;
}

type TimeMatch = "overlaps" | "no-overlap" | "unknown";

/** Whether the event's own schedule overlaps `tripTime`. "unknown" when there's no usable schedule data to check against. */
export function matchEventTime(event: Open511Event, tripTime: Date): TimeMatch {
  const intervals = parseScheduleIntervals(event);
  if (intervals.length === 0) return "unknown";

  const overlaps = intervals.some(
    (interval) => tripTime.getTime() >= interval.start.getTime() && tripTime.getTime() <= interval.end.getTime(),
  );
  return overlaps ? "overlaps" : "no-overlap";
}

function eventGeometryPoints(geometry: RoadEventGeometry): LatLng[] {
  if (geometry.type === "Point") {
    const [longitude, latitude] = geometry.coordinates;
    return [{ latitude, longitude }];
  }
  return geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
}

/** Whether any point of the event's geometry falls within `thresholdMeters` of any point on the route's actual path. */
export function isEventNearRoute(
  geometry: RoadEventGeometry,
  routePath: LatLng[],
  thresholdMeters = ROAD_EVENT_PROXIMITY_METERS,
): boolean {
  const eventPoints = eventGeometryPoints(geometry);
  for (const eventPoint of eventPoints) {
    for (const routePoint of routePath) {
      if (haversineDistanceMeters(eventPoint, routePoint) <= thresholdMeters) return true;
    }
  }
  return false;
}

function extractGeometry(event: Open511Event): RoadEventGeometry | undefined {
  const geometry = event.geography;
  if (!geometry) return undefined;
  if (geometry.type === "Point" || geometry.type === "LineString") return geometry;
  return undefined;
}

/** Converts one Open511 event into WinterRoute's provider-neutral shape — only the fields actually used. */
export function open511EventToRoadEvent(event: Open511Event, tripTime: Date): RoadEvent | null {
  if (!event.headline) return null;

  const timeMatch = matchEventTime(event, tripTime);
  const intervals = parseScheduleIntervals(event);
  const road = event.roads?.[0];

  return {
    provider: "drivebc",
    id: event.id,
    eventType: normalizeEventType(event.event_type),
    headline: event.headline,
    description: event.description ?? "",
    severity: normalizeSeverity(event.severity),
    createdAt: event.created ? new Date(event.created) : undefined,
    updatedAt: event.updated ? new Date(event.updated) : undefined,
    effectiveStart: intervals.length > 0 ? new Date(Math.min(...intervals.map((i) => i.start.getTime()))) : undefined,
    effectiveEnd: intervals.length > 0 ? new Date(Math.max(...intervals.map((i) => i.end.getTime()))) : undefined,
    timeRelevance: timeMatch === "overlaps" ? "overlaps" : "unknown",
    roadName: road?.name,
    roadDirection: road?.direction,
    geometry: extractGeometry(event),
  };
}

/**
 * The combined spatial + temporal relevance filter. An event is kept only
 * when its geometry is known and near the route (a road event with no
 * usable geometry can't be confirmed relevant, so it's excluded rather
 * than assumed relevant), AND its schedule either overlaps the trip time
 * or simply isn't known (excluded only when the schedule is known AND
 * confirmed *not* to overlap — see `matchEventTime`).
 */
export function selectRelevantRoadEvents(
  events: Open511Event[],
  routePath: LatLng[],
  tripTime: Date,
): RoadEvent[] {
  const relevant: RoadEvent[] = [];

  for (const event of events) {
    const geometry = extractGeometry(event);
    if (!geometry || !isEventNearRoute(geometry, routePath)) continue;

    const timeMatch = matchEventTime(event, tripTime);
    if (timeMatch === "no-overlap") continue;

    const roadEvent = open511EventToRoadEvent(event, tripTime);
    if (roadEvent) relevant.push(roadEvent);
  }

  return relevant;
}
