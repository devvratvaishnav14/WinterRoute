import type { Route } from "@/lib/route/types";
import type { TransportMode } from "@/lib/trip/types";
import type {
  TransitAlert,
  TransitAlertActivePeriod,
  TransitAnalysis,
  TransitSegmentAnalysis,
  TransitSegmentRealtime,
  TransitVehicleObservation,
} from "@/lib/transit/types";
import { throwApiError } from "./apiError";

export interface AnalyzeTransitRequest {
  route: Route;
  mode: TransportMode;
  dateTime: Date;
}

type RawActivePeriod = Omit<TransitAlertActivePeriod, "start" | "end"> & { start?: string; end?: string };
type RawAlert = Omit<TransitAlert, "activePeriods"> & { activePeriods: RawActivePeriod[] };
type RawVehicle = Omit<TransitVehicleObservation, "observedAt"> & { observedAt: string };
type RawRealtime = Omit<TransitSegmentRealtime, "realtimeDeparture" | "realtimeArrival" | "vehicle"> & {
  realtimeDeparture?: string;
  realtimeArrival?: string;
  vehicle?: RawVehicle;
};
type RawSegment = Omit<TransitSegmentAnalysis, "scheduledDeparture" | "scheduledArrival" | "realtime" | "relevantAlerts"> & {
  scheduledDeparture?: string;
  scheduledArrival?: string;
  realtime?: RawRealtime;
  relevantAlerts: RawAlert[];
};
type RawAnalysis = Omit<TransitAnalysis, "analyzedAt" | "selectedTripTime" | "transitSegments" | "systemAlerts" | "feedTimestamps"> & {
  analyzedAt: string;
  selectedTripTime: string;
  transitSegments: RawSegment[];
  systemAlerts: RawAlert[];
  feedTimestamps: {
    gtfsStaticRetrievedAt?: string;
    tripUpdatesHeaderTime?: string;
    vehiclePositionsHeaderTime?: string;
    serviceAlertsHeaderTime?: string;
  };
};

function toDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function reviveActivePeriod(raw: RawActivePeriod): TransitAlertActivePeriod {
  return { start: toDate(raw.start), end: toDate(raw.end) };
}

function reviveAlert(raw: RawAlert): TransitAlert {
  return { ...raw, activePeriods: raw.activePeriods.map(reviveActivePeriod) };
}

function reviveVehicle(raw: RawVehicle): TransitVehicleObservation {
  return { ...raw, observedAt: new Date(raw.observedAt) };
}

function reviveRealtime(raw: RawRealtime): TransitSegmentRealtime {
  return {
    ...raw,
    realtimeDeparture: toDate(raw.realtimeDeparture),
    realtimeArrival: toDate(raw.realtimeArrival),
    vehicle: raw.vehicle ? reviveVehicle(raw.vehicle) : undefined,
  };
}

function reviveSegment(raw: RawSegment): TransitSegmentAnalysis {
  return {
    ...raw,
    scheduledDeparture: toDate(raw.scheduledDeparture),
    scheduledArrival: toDate(raw.scheduledArrival),
    realtime: raw.realtime ? reviveRealtime(raw.realtime) : undefined,
    relevantAlerts: raw.relevantAlerts.map(reviveAlert),
  };
}

function reviveAnalysis(raw: RawAnalysis): TransitAnalysis {
  return {
    ...raw,
    analyzedAt: new Date(raw.analyzedAt),
    selectedTripTime: new Date(raw.selectedTripTime),
    transitSegments: raw.transitSegments.map(reviveSegment),
    systemAlerts: raw.systemAlerts.map(reviveAlert),
    feedTimestamps: {
      gtfsStaticRetrievedAt: toDate(raw.feedTimestamps.gtfsStaticRetrievedAt),
      tripUpdatesHeaderTime: toDate(raw.feedTimestamps.tripUpdatesHeaderTime),
      vehiclePositionsHeaderTime: toDate(raw.feedTimestamps.vehiclePositionsHeaderTime),
      serviceAlertsHeaderTime: toDate(raw.feedTimestamps.serviceAlertsHeaderTime),
    },
  };
}

export async function analyzeTransit(request: AnalyzeTransitRequest, signal?: AbortSignal): Promise<TransitAnalysis> {
  const response = await fetch("/api/transit/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route: request.route,
      mode: request.mode,
      dateTime: request.dateTime.toISOString(),
    }),
    signal,
  });

  if (!response.ok) return throwApiError(response);

  const data = (await response.json()) as { result: RawAnalysis };
  return reviveAnalysis(data.result);
}
