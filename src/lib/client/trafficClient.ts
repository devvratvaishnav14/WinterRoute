import type { Route } from "@/lib/route/types";
import type { TimePreference, TransportMode } from "@/lib/trip/types";
import type { RoadEvent, RouteTrafficResult, TrafficAnalysis, TrafficAnalysisResult } from "@/lib/traffic/types";
import { throwApiError } from "./apiError";

export interface AnalyzeTrafficRequest {
  route: Route;
  mode: TransportMode;
  timePreference: TimePreference;
  dateTime: Date;
}

type RawTrafficAnalysis = Omit<TrafficAnalysis, "analyzedAt" | "commuteDepartureTime"> & {
  analyzedAt: string;
  commuteDepartureTime: string;
};
type RawTrafficAnalysisResult =
  | { status: "analyzed"; analysis: RawTrafficAnalysis }
  | { status: "not-applicable"; reason: string }
  | { status: "unavailable"; reason: string };
type RawRoadEvent = Omit<RoadEvent, "createdAt" | "updatedAt" | "effectiveStart" | "effectiveEnd"> & {
  createdAt?: string;
  updatedAt?: string;
  effectiveStart?: string;
  effectiveEnd?: string;
};
type RawRouteTrafficResult = Omit<RouteTrafficResult, "trafficAnalysis" | "roadEvents"> & {
  trafficAnalysis: RawTrafficAnalysisResult;
  roadEvents: RawRoadEvent[];
};

function toDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function reviveTrafficAnalysisResult(raw: RawTrafficAnalysisResult): TrafficAnalysisResult {
  if (raw.status !== "analyzed") return raw;
  return {
    status: "analyzed",
    analysis: {
      ...raw.analysis,
      analyzedAt: new Date(raw.analysis.analyzedAt),
      commuteDepartureTime: new Date(raw.analysis.commuteDepartureTime),
    },
  };
}

function reviveResult(raw: RawRouteTrafficResult): RouteTrafficResult {
  return {
    trafficAnalysis: reviveTrafficAnalysisResult(raw.trafficAnalysis),
    roadEventStatus: raw.roadEventStatus,
    roadEvents: raw.roadEvents.map((event) => ({
      ...event,
      createdAt: toDate(event.createdAt),
      updatedAt: toDate(event.updatedAt),
      effectiveStart: toDate(event.effectiveStart),
      effectiveEnd: toDate(event.effectiveEnd),
    })),
  };
}

export async function analyzeTraffic(
  request: AnalyzeTrafficRequest,
  signal?: AbortSignal,
): Promise<RouteTrafficResult> {
  const response = await fetch("/api/traffic/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route: request.route,
      mode: request.mode,
      timePreference: request.timePreference,
      dateTime: request.dateTime.toISOString(),
    }),
    signal,
  });

  if (!response.ok) return throwApiError(response);

  const data = (await response.json()) as { result: RawRouteTrafficResult };
  return reviveResult(data.result);
}
