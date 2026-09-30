import { parseCsvTable, streamCsvRows } from "./csv";
import type { GtfsStaticRawTables } from "./fetchGtfsStatic";
import { activeServiceIdsForDate } from "./calendar";
import type { GtfsCalendar, GtfsCalendarDate, GtfsRoute, GtfsStop, GtfsStopTime, GtfsTrip } from "./types";

/**
 * An indexed, queryable view over one downloaded GTFS static snapshot.
 *
 * `routes.txt`, `trips.txt`, `stops.txt`, `calendar.txt`, and
 * `calendar_dates.txt` are all comfortably small (low hundreds to tens of
 * thousands of rows in TransLink's real feed) and are eagerly parsed and
 * indexed in the constructor. `stop_times.txt` is not — see
 * `GtfsStaticRawTables.stopTimesText`'s doc comment — its raw text is kept
 * as-is and only scanned on demand, filtered to the specific trip IDs a
 * caller actually needs (`stopTimesForTrips`), which keeps the one large
 * scan proportional to how the caller uses it rather than to the whole
 * feed's size on every construction.
 */
export class GtfsStaticStore {
  readonly fetchedAt: Date;

  private readonly routesById = new Map<string, GtfsRoute>();
  private readonly routesByShortName = new Map<string, GtfsRoute[]>();
  private readonly routesByLongName = new Map<string, GtfsRoute[]>();
  private readonly tripsById = new Map<string, GtfsTrip>();
  private readonly tripsByRouteId = new Map<string, GtfsTrip[]>();
  private readonly stopsById = new Map<string, GtfsStop>();
  private readonly calendars: GtfsCalendar[];
  private readonly calendarDates: GtfsCalendarDate[];
  private readonly stopTimesText: string;

  constructor(raw: GtfsStaticRawTables) {
    this.fetchedAt = raw.fetchedAt;
    this.stopTimesText = raw.stopTimesText;

    for (const row of parseCsvTable(raw.routesText) as unknown as GtfsRoute[]) {
      this.routesById.set(row.route_id, row);
      const byShortName = this.routesByShortName.get(row.route_short_name) ?? [];
      byShortName.push(row);
      this.routesByShortName.set(row.route_short_name, byShortName);

      const byLongName = this.routesByLongName.get(row.route_long_name) ?? [];
      byLongName.push(row);
      this.routesByLongName.set(row.route_long_name, byLongName);
    }

    for (const row of parseCsvTable(raw.tripsText) as unknown as GtfsTrip[]) {
      this.tripsById.set(row.trip_id, row);
      const byRoute = this.tripsByRouteId.get(row.route_id) ?? [];
      byRoute.push(row);
      this.tripsByRouteId.set(row.route_id, byRoute);
    }

    for (const row of parseCsvTable(raw.stopsText) as unknown as GtfsStop[]) {
      this.stopsById.set(row.stop_id, row);
    }

    this.calendars = parseCsvTable(raw.calendarText) as unknown as GtfsCalendar[];
    this.calendarDates = parseCsvTable(raw.calendarDatesText) as unknown as GtfsCalendarDate[];
  }

  routeById(routeId: string): GtfsRoute | undefined {
    return this.routesById.get(routeId);
  }

  /** GTFS `route_short_name` is not unique on its own (e.g. the same number can appear for different directions/branches or, rarely, agencies) — always returns an array, never picks one. */
  findRoutesByShortName(shortName: string): GtfsRoute[] {
    return this.routesByShortName.get(shortName) ?? [];
  }

  /**
   * SkyTrain/rail routes have no `route_short_name` at all in TransLink's
   * real feed (confirmed live — e.g. the Expo Line's `route_short_name` is
   * an empty string) — `route_long_name` ("Expo Line") is the only
   * identifying field available for them, and it was confirmed live to
   * match Google's `transitLine.name` exactly for rail segments. See
   * `matching.ts`'s fallback to this when a segment has no short name.
   */
  findRoutesByLongName(longName: string): GtfsRoute[] {
    return this.routesByLongName.get(longName) ?? [];
  }

  tripById(tripId: string): GtfsTrip | undefined {
    return this.tripsById.get(tripId);
  }

  tripsForRoute(routeId: string): GtfsTrip[] {
    return this.tripsByRouteId.get(routeId) ?? [];
  }

  stopById(stopId: string): GtfsStop | undefined {
    return this.stopsById.get(stopId);
  }

  /** The `service_id`s actually active on a given GTFS service date, combining `calendar.txt` + `calendar_dates.txt` — see `calendar.ts`. */
  activeServiceIds(serviceDate: string): Set<string> {
    return activeServiceIdsForDate(serviceDate, this.calendars, this.calendarDates);
  }

  /**
   * Scans `stop_times.txt` exactly once, returning only the rows for the
   * requested trip IDs, grouped by trip and sorted by `stop_sequence`.
   * Callers should narrow `tripIds` as much as possible first (by
   * route/service/time via the other indexes) before calling this — it's
   * still a full linear scan of a ~1.84M-row file underneath.
   */
  stopTimesForTrips(tripIds: Set<string>): Map<string, GtfsStopTime[]> {
    const result = new Map<string, GtfsStopTime[]>();
    if (tripIds.size === 0) return result;

    for (const row of streamCsvRows(this.stopTimesText)) {
      const stopTime = row as unknown as GtfsStopTime;
      if (!tripIds.has(stopTime.trip_id)) continue;
      const existing = result.get(stopTime.trip_id) ?? [];
      existing.push(stopTime);
      result.set(stopTime.trip_id, existing);
    }

    for (const stopTimes of result.values()) {
      stopTimes.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    }

    return result;
  }

  /** Convenience wrapper over `stopTimesForTrips` for a single trip. */
  stopTimesForTrip(tripId: string): GtfsStopTime[] {
    return this.stopTimesForTrips(new Set([tripId])).get(tripId) ?? [];
  }
}
