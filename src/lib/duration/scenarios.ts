/**
 * A structured scenario matrix for `computeExpectedDuration`, mirroring
 * `lib/scoring/scenarios.ts`'s role for the risk model — realistic
 * *synthetic* features, never real provider JSON. Consumed by
 * `scenarios.test.ts` and `scripts/durationScenarios.ts` (a development
 * CLI, not a user-facing dashboard). Not imported by any production code.
 */
import type { Route } from "@/lib/route/types";
import type { RouteTrafficResult } from "@/lib/traffic/types";
import type { RouteWeatherAnalysis } from "@/lib/weather/types";
import type { TransitAnalysis } from "@/lib/transit/types";
import {
  forecast,
  route,
  segment,
  trafficAnalysis,
  trafficResult,
  transitAnalysis,
  transitSegmentAnalysis,
  weatherAnalysis,
  weatherSample,
} from "@/lib/scoring/fixtures";

export interface DurationScenarioInputs {
  route: Route;
  weather: RouteWeatherAnalysis | null;
  traffic: RouteTrafficResult | null;
  transit: TransitAnalysis | null;
  now: Date;
}

export interface DurationScenarioDefinition {
  name: string;
  category: string;
  build: () => DurationScenarioInputs;
}

export const DURATION_SCENARIO_NOW = new Date("2026-09-24T14:00:00Z");

function driveRoute(durationMinutes = 30): Route {
  return route([segment({ id: "s1", mode: "drive", durationMinutes })]);
}
function walkRoute(durationMinutes = 30): Route {
  return route([segment({ id: "s1", mode: "walk", durationMinutes })]);
}
function cycleRoute(durationMinutes = 30): Route {
  return route([segment({ id: "s1", mode: "cycle", durationMinutes })]);
}
function busRoute(durationMinutes = 20): Route {
  return route([segment({ id: "b1", mode: "bus", durationMinutes })]);
}
function twoLegTransitRoute(): Route {
  return route([
    segment({ id: "b1", mode: "bus", durationMinutes: 16, startTime: new Date("2026-09-24T15:00:00Z"), endTime: new Date("2026-09-24T15:16:00Z"), transitLine: { shortName: "145", longName: "", headsign: "", agencyName: "TransLink" } }),
    segment({ id: "w1", mode: "walk", durationMinutes: 2 }),
    segment({ id: "r1", mode: "rail", startTime: new Date("2026-09-24T15:20:00Z"), endTime: new Date("2026-09-24T15:24:00Z") }),
  ]);
}

const CLEAR = { temperatureC: 14, precipitationMm: 0, snowfallCm: 0, windSpeedKmh: 8 };

function weatherWith(overrides: Partial<ReturnType<typeof forecast>>, segmentId = "s1"): RouteWeatherAnalysis {
  return weatherAnalysis({ samples: [weatherSample(segmentId, [forecast({ ...CLEAR, ...overrides })])] });
}

function trafficWith(delayMinutes: number, recency: "near-term" | "future" = "near-term"): RouteTrafficResult {
  return trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: delayMinutes, trafficAwareDurationMinutes: 30 + delayMinutes, recency }) } });
}

const NOT_APPLICABLE_TRAFFIC = (reason: string): RouteTrafficResult => trafficResult({ trafficAnalysis: { status: "not-applicable", reason } });
const NOT_APPLICABLE_TRANSIT: TransitAnalysis = transitAnalysis({ status: "not-applicable", reason: "no transit segments" });

export const DURATION_SCENARIOS: DurationScenarioDefinition[] = [
  // --- CAR ---
  { name: "Car — clear, no traffic", category: "car", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficWith(0), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Car — moderate traffic", category: "car", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficWith(8), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Car — severe traffic", category: "car", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficWith(22), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Car — traffic + snow", category: "car", build: () => ({ route: driveRoute(), weather: weatherWith({ snowfallCm: 4, temperatureC: -2 }), traffic: trafficWith(10), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Car — future traffic + snow", category: "car", build: () => ({ route: driveRoute(), weather: weatherWith({ snowfallCm: 4, temperatureC: -2 }), traffic: trafficWith(10, "future"), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  {
    name: "Car — road event",
    category: "car",
    build: () => ({
      route: driveRoute(),
      weather: weatherWith({}),
      traffic: trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficAwareDurationMinutes: 30 }) }, roadEvents: [{ provider: "drivebc", id: "E1", eventType: "incident", headline: "x", description: "", severity: "major", timeRelevance: "overlaps", geometry: { type: "Point", coordinates: [-123.1, 49.28] } }] }),
      transit: NOT_APPLICABLE_TRANSIT,
      now: DURATION_SCENARIO_NOW,
    }),
  },

  // --- WALK ---
  { name: "Walk — clear", category: "walk", build: () => ({ route: walkRoute(), weather: weatherWith({}), traffic: NOT_APPLICABLE_TRAFFIC("walk"), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Walk — rain", category: "walk", build: () => ({ route: walkRoute(), weather: weatherWith({ precipitationMm: 10 }), traffic: NOT_APPLICABLE_TRAFFIC("walk"), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Walk — heavy snow", category: "walk", build: () => ({ route: walkRoute(), weather: weatherWith({ snowfallCm: 8, temperatureC: -4 }), traffic: NOT_APPLICABLE_TRAFFIC("walk"), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Walk — freezing conditions", category: "walk", build: () => ({ route: walkRoute(), weather: weatherWith({ temperatureC: -3, precipitationMm: 2 }), traffic: NOT_APPLICABLE_TRAFFIC("walk"), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },

  // --- CYCLE ---
  { name: "Cycle — clear", category: "cycle", build: () => ({ route: cycleRoute(), weather: weatherWith({}), traffic: NOT_APPLICABLE_TRAFFIC("cycle"), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Cycle — wind", category: "cycle", build: () => ({ route: cycleRoute(), weather: weatherWith({ windSpeedKmh: 45 }), traffic: NOT_APPLICABLE_TRAFFIC("cycle"), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Cycle — rain", category: "cycle", build: () => ({ route: cycleRoute(), weather: weatherWith({ precipitationMm: 8 }), traffic: NOT_APPLICABLE_TRAFFIC("cycle"), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Cycle — freezing", category: "cycle", build: () => ({ route: cycleRoute(), weather: weatherWith({ temperatureC: -2 }), traffic: NOT_APPLICABLE_TRAFFIC("cycle"), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },

  // --- TRANSIT ---
  { name: "Transit — schedule only", category: "transit", build: () => ({ route: busRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only" })] }), now: DURATION_SCENARIO_NOW }) },
  { name: "Transit — +5 min realtime delay", category: "transit", build: () => ({ route: busRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", arrivalDelaySeconds: 300 } })] }), now: DURATION_SCENARIO_NOW }) },
  { name: "Transit — +15 min realtime delay", category: "transit", build: () => ({ route: busRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", arrivalDelaySeconds: 900 } })] }), now: DURATION_SCENARIO_NOW }) },
  {
    name: "Transit — service alert only",
    category: "transit",
    build: () => ({
      route: busRoute(),
      weather: null,
      traffic: NOT_APPLICABLE_TRAFFIC("bus"),
      transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only", relevantAlerts: [{ provider: "translink", id: "a1", cause: "unknown", effect: "significantDelays", headerText: "", descriptionText: "", activePeriods: [], matchedOn: "route" }] })] }),
      now: DURATION_SCENARIO_NOW,
    }),
  },
  {
    name: "Transit — missed transfer",
    category: "transit",
    build: () => ({
      route: twoLegTransitRoute(),
      weather: null,
      traffic: NOT_APPLICABLE_TRAFFIC("bus"),
      transit: transitAnalysis({
        transitSegments: [
          transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", scheduledDeparture: new Date("2026-09-24T15:00:00Z"), scheduledArrival: new Date("2026-09-24T15:16:00Z"), realtime: { tripStatus: "scheduled", realtimeArrival: new Date("2026-09-24T15:24:00Z"), arrivalDelaySeconds: 480 } }),
          transitSegmentAnalysis({ routeSegmentId: "r1", mode: "rail", status: "matched-schedule-only", scheduledDeparture: new Date("2026-09-24T15:20:00Z"), scheduledArrival: new Date("2026-09-24T15:24:00Z") }),
        ],
      }),
      now: DURATION_SCENARIO_NOW,
    }),
  },
  {
    name: "Transit — cancellation",
    category: "transit",
    build: () => ({
      route: busRoute(),
      weather: null,
      traffic: NOT_APPLICABLE_TRAFFIC("bus"),
      transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-with-realtime", realtime: { tripStatus: "canceled" } })] }),
      now: DURATION_SCENARIO_NOW,
    }),
  },

  // --- PROVIDER FAILURE ---
  { name: "Provider failure — traffic unavailable", category: "providerFailure", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: null, transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Provider failure — weather unavailable", category: "providerFailure", build: () => ({ route: walkRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("walk"), transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
  { name: "Provider failure — transit realtime unavailable (schedule survives)", category: "providerFailure", build: () => ({ route: busRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only" })], sourceStatus: { gtfsStatic: "ok", tripUpdates: "unavailable", vehiclePositions: "unavailable", serviceAlerts: "ok" } }), now: DURATION_SCENARIO_NOW }) },
  { name: "Provider failure — multiple sources unavailable", category: "providerFailure", build: () => ({ route: driveRoute(), weather: null, traffic: null, transit: NOT_APPLICABLE_TRANSIT, now: DURATION_SCENARIO_NOW }) },
];
