/**
 * A structured scenario matrix for exercising `computeCommuteRisk`
 * end-to-end with realistic *synthetic features* (never real provider
 * JSON) — the reusable validation harness requested alongside V0
 * hardening. Used by:
 *
 * - `scenarios.test.ts` (automated invariant checks over every scenario)
 * - `scripts/riskScenarios.ts` (a development-only CLI that prints every
 *   scenario's full result for manual inspection — not a user-facing
 *   dashboard)
 *
 * Not imported by any production/application code.
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
} from "./fixtures";

export interface ScenarioInputs {
  route: Route;
  weather: RouteWeatherAnalysis | null;
  traffic: RouteTrafficResult | null;
  transit: TransitAnalysis | null;
  now: Date;
}

export interface ScenarioDefinition {
  name: string;
  category: string;
  build: () => ScenarioInputs;
}

export const SCENARIO_NOW = new Date("2026-09-24T14:00:00Z"); // 07:00 PDT, Thursday

function driveRoute(durationMinutes = 30): Route {
  return route([segment({ id: "s1", mode: "drive", durationMinutes })]);
}
function walkRoute(durationMinutes = 30): Route {
  return route([segment({ id: "s1", mode: "walk", durationMinutes })]);
}
function cycleRoute(durationMinutes = 30): Route {
  return route([segment({ id: "s1", mode: "cycle", durationMinutes })]);
}
function busRoute(durationMinutes = 30): Route {
  return route([segment({ id: "s1", mode: "bus", durationMinutes })]);
}

const CLEAR = { temperatureC: 14, precipitationMm: 0, snowfallCm: 0, windSpeedKmh: 8, visibilityKm: 15 };

function weatherWith(overrides: Partial<ReturnType<typeof forecast>>, segmentId = "s1"): RouteWeatherAnalysis {
  return weatherAnalysis({ samples: [weatherSample(segmentId, [forecast({ ...CLEAR, ...overrides })])] });
}

function trafficWith(delayMinutes: number, jamShare = 0): RouteTrafficResult {
  return trafficResult({
    trafficAnalysis: {
      status: "analyzed",
      analysis: trafficAnalysis({
        trafficDelayMinutes: delayMinutes,
        intervals:
          jamShare > 0
            ? [
                { startPolylineIndex: 0, endPolylineIndex: 1, condition: "normal", distanceMeters: (1 - jamShare) * 1000 },
                { startPolylineIndex: 1, endPolylineIndex: 2, condition: "trafficJam", distanceMeters: jamShare * 1000 },
              ]
            : [],
      }),
    },
  });
}

const NOT_APPLICABLE_TRAFFIC = (reason: string): RouteTrafficResult =>
  trafficResult({ trafficAnalysis: { status: "not-applicable", reason } });
const NOT_APPLICABLE_TRANSIT: TransitAnalysis = transitAnalysis({ status: "not-applicable", reason: "no transit segments" });

export const RISK_SCENARIOS: ScenarioDefinition[] = [
  // --- CLEAR / NORMAL ---
  { name: "Clear — walk", category: "clear", build: () => ({ route: walkRoute(), weather: weatherWith({}), traffic: NOT_APPLICABLE_TRAFFIC("walk"), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Clear — cycle", category: "clear", build: () => ({ route: cycleRoute(), weather: weatherWith({}), traffic: NOT_APPLICABLE_TRAFFIC("cycle"), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Clear — car", category: "clear", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficWith(0), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Clear — transit (schedule only)", category: "clear", build: () => ({ route: busRoute(), weather: weatherWith({}), traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-schedule-only" })] }), now: SCENARIO_NOW }) },

  // --- RAIN ---
  { name: "Rain — light (car)", category: "rain", build: () => ({ route: driveRoute(), weather: weatherWith({ precipitationMm: 1.5 }), traffic: trafficWith(0), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Rain — moderate (car)", category: "rain", build: () => ({ route: driveRoute(), weather: weatherWith({ precipitationMm: 5 }), traffic: trafficWith(0), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Rain — heavy (walk)", category: "rain", build: () => ({ route: walkRoute(), weather: weatherWith({ precipitationMm: 13 }), traffic: NOT_APPLICABLE_TRAFFIC("walk"), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },

  // --- SNOW ---
  { name: "Snow — light (car)", category: "snow", build: () => ({ route: driveRoute(), weather: weatherWith({ snowfallCm: 0.5, temperatureC: -1 }), traffic: trafficWith(0), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Snow — moderate (car)", category: "snow", build: () => ({ route: driveRoute(), weather: weatherWith({ snowfallCm: 3, temperatureC: -2 }), traffic: trafficWith(0), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Snow — heavy (walk)", category: "snow", build: () => ({ route: walkRoute(), weather: weatherWith({ snowfallCm: 9, temperatureC: -4 }), traffic: NOT_APPLICABLE_TRAFFIC("walk"), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },

  // --- FREEZING ---
  { name: "Freezing conditions (walk)", category: "freezing", build: () => ({ route: walkRoute(), weather: weatherWith({ temperatureC: -3, precipitationMm: 2 }), traffic: NOT_APPLICABLE_TRAFFIC("walk"), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },

  // --- WIND ---
  { name: "Wind — moderate (cycle)", category: "wind", build: () => ({ route: cycleRoute(), weather: weatherWith({ windSpeedKmh: 30 }), traffic: NOT_APPLICABLE_TRAFFIC("cycle"), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Wind — strong (cycle)", category: "wind", build: () => ({ route: cycleRoute(), weather: weatherWith({ windSpeedKmh: 55 }), traffic: NOT_APPLICABLE_TRAFFIC("cycle"), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },

  // --- TRAFFIC ---
  { name: "Traffic — none (car)", category: "traffic", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficWith(0), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Traffic — moderate (car)", category: "traffic", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficWith(8, 0.2), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Traffic — severe (car)", category: "traffic", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficWith(25, 0.7), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },

  // --- TRANSIT ---
  { name: "Transit — schedule only", category: "transit", build: () => ({ route: busRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-schedule-only" })] }), now: SCENARIO_NOW }) },
  { name: "Transit — realtime, minor delay", category: "transit", build: () => ({ route: busRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds: 90 } })] }), now: SCENARIO_NOW }) },
  // 600s (10min) deliberately stays below the delay curve's 15-minute saturation point, so this
  // scenario is distinguishable from both a full cancellation and the curve's own maximum.
  { name: "Transit — realtime, major delay", category: "transit", build: () => ({ route: busRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", departureDelaySeconds: 600 } })] }), now: SCENARIO_NOW }) },
  { name: "Transit — skipped stop", category: "transit", build: () => ({ route: busRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "scheduled", arrivalStopStatus: "skipped" } })] }), now: SCENARIO_NOW }) },
  { name: "Transit — canceled trip", category: "transit", build: () => ({ route: busRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "canceled" } })] }), now: SCENARIO_NOW }) },
  { name: "Transit — service alert (NO_SERVICE)", category: "transit", build: () => ({ route: busRoute(), weather: null, traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-schedule-only", relevantAlerts: [{ provider: "translink", id: "a1", cause: "unknown", effect: "noService", headerText: "Suspended", descriptionText: "", activePeriods: [], matchedOn: "route" }] })] }), now: SCENARIO_NOW }) },

  // --- ROAD EVENTS ---
  { name: "Road event — ordinary construction", category: "roadEvents", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficResult({ roadEvents: [{ provider: "drivebc", id: "E1", eventType: "construction", headline: "Lane closure", description: "", severity: "moderate", timeRelevance: "overlaps", geometry: { type: "Point", coordinates: [-123.1, 49.28] } }] }), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Road event — incident", category: "roadEvents", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficResult({ roadEvents: [{ provider: "drivebc", id: "E2", eventType: "incident", headline: "Collision", description: "", severity: "moderate", timeRelevance: "overlaps", geometry: { type: "Point", coordinates: [-123.1, 49.28] } }] }), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Road event — major severity", category: "roadEvents", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficResult({ roadEvents: [{ provider: "drivebc", id: "E3", eventType: "incident", headline: "Highway closed", description: "", severity: "major", timeRelevance: "overlaps", geometry: { type: "Point", coordinates: [-123.1, 49.28] } }] }), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },

  // --- PROVIDER FAILURES ---
  { name: "Provider failure — weather partial", category: "providerFailure", build: () => ({ route: driveRoute(), weather: weatherAnalysis({ samples: [weatherSample("s1", [forecast(CLEAR)])], modelStatus: [{ modelId: "a", displayName: "A", succeeded: true }, { modelId: "b", displayName: "B", succeeded: false, errorMessage: "timeout" }] }), traffic: trafficWith(0), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Provider failure — traffic unavailable", category: "providerFailure", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficResult({ trafficAnalysis: { status: "unavailable", reason: "network error" } }), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Provider failure — transit realtime unavailable (schedule survives)", category: "providerFailure", build: () => ({ route: busRoute(), weather: weatherWith({}), traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-schedule-only" })], sourceStatus: { gtfsStatic: "ok", tripUpdates: "unavailable", vehiclePositions: "unavailable", serviceAlerts: "ok" } }), now: SCENARIO_NOW }) },
  { name: "Provider failure — all applicable sources unavailable (drive)", category: "providerFailure", build: () => ({ route: driveRoute(), weather: null, traffic: trafficResult({ trafficAnalysis: { status: "unavailable", reason: "x" }, roadEventStatus: "unavailable" }), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },

  // --- MIXED ---
  { name: "Mixed — snow + traffic (car)", category: "mixed", build: () => ({ route: driveRoute(), weather: weatherWith({ snowfallCm: 4, temperatureC: -2 }), traffic: trafficWith(15, 0.5), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
  { name: "Mixed — rain + transit alert", category: "mixed", build: () => ({ route: busRoute(), weather: weatherWith({ precipitationMm: 6 }), traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-schedule-only", relevantAlerts: [{ provider: "translink", id: "a2", cause: "unknown", effect: "significantDelays", headerText: "Delays", descriptionText: "", activePeriods: [], matchedOn: "route" }] })] }), now: SCENARIO_NOW }) },
  { name: "Mixed — snow + transit cancellation", category: "mixed", build: () => ({ route: busRoute(), weather: weatherWith({ snowfallCm: 5, temperatureC: -3 }), traffic: NOT_APPLICABLE_TRAFFIC("bus"), transit: transitAnalysis({ transitSegments: [transitSegmentAnalysis({ routeSegmentId: "s1", status: "matched-with-realtime", realtime: { tripStatus: "canceled" } })] }), now: SCENARIO_NOW }) },
  { name: "Mixed — severe traffic + construction", category: "mixed", build: () => ({ route: driveRoute(), weather: weatherWith({}), traffic: trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 20 }) }, roadEvents: [{ provider: "drivebc", id: "E4", eventType: "construction", headline: "Major roadwork", description: "", severity: "major", timeRelevance: "overlaps", geometry: { type: "Point", coordinates: [-123.1, 49.28] } }] }), transit: NOT_APPLICABLE_TRANSIT, now: SCENARIO_NOW }) },
];
