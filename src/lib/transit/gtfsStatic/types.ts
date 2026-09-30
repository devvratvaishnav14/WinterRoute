/**
 * Raw GTFS static row shapes — deliberately just the columns WinterRoute
 * actually reads from each file, typed as the strings GTFS always uses on
 * disk (numeric/boolean parsing happens where a value is used, not here).
 * These are intermediate provider-shaped types, same role as
 * `GoogleRouteStep` in `lib/google/routes.ts` — never exposed outside the
 * `transit` module's static/matching layers.
 */

export interface GtfsRoute {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
  agency_id?: string;
}

export interface GtfsTrip {
  trip_id: string;
  route_id: string;
  service_id: string;
  trip_headsign?: string;
  direction_id?: string;
}

export interface GtfsStop {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
}

export interface GtfsStopTime {
  trip_id: string;
  stop_id: string;
  stop_sequence: string;
  arrival_time: string;
  departure_time: string;
}

export interface GtfsCalendar {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

export type GtfsCalendarDateExceptionType = "1" | "2";

export interface GtfsCalendarDate {
  service_id: string;
  date: string;
  exception_type: GtfsCalendarDateExceptionType | string;
}
