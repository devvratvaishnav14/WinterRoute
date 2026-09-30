/**
 * A small set of illustrative `PredictionSnapshot` fixtures, shaped after
 * patterns actually observed during this project's live-testing sessions
 * (see docs/decisions/0008-risk-model-v0.md and
 * docs/decisions/0009-v0-hardening-and-evaluation-design.md) — but built
 * from synthetic feature values, not captured real API responses, and
 * using deliberately generic route labels rather than exact real place
 * names or coordinates. Useful as stable, committable fixtures for future
 * evaluation-tooling development. Not imported by any application code.
 */
import { computeCommuteRisk } from "@/lib/scoring/computeCommuteRisk";
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
import { createPredictionSnapshot } from "./createSnapshot";
import type { PredictionSnapshot } from "./types";

const NOW = new Date("2026-09-24T14:00:00Z");

function driveRoute() {
  return route(
    [segment({ id: "s1", mode: "drive", durationMinutes: 28, distanceMeters: 21000 })],
    { origin: { label: "University campus area", latitude: 49.28, longitude: -122.92 }, destination: { label: "Suburban transit hub", latitude: 49.19, longitude: -122.85 } },
  );
}

function transitRoute() {
  return route(
    [
      segment({ id: "w1", mode: "walk", durationMinutes: 5 }),
      segment({ id: "b1", mode: "bus", durationMinutes: 16, transitLine: { shortName: "145", longName: "Campus Exchange", headsign: "Station", agencyName: "Transit Agency" } }),
      segment({ id: "w2", mode: "walk", durationMinutes: 2 }),
    ],
    { origin: { label: "University campus area", latitude: 49.28, longitude: -122.92 }, destination: { label: "Regional interchange station", latitude: 49.25, longitude: -122.92 } },
  );
}

export function lowDisruptionCarCase(): PredictionSnapshot {
  const r = driveRoute();
  const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 16, precipitationMm: 0, snowfallCm: 0, windSpeedKmh: 6, visibilityKm: 16 })])] });
  const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 0 }) } });
  const transit = transitAnalysis({ status: "not-applicable", reason: "no transit segments" });
  const risk = computeCommuteRisk({ route: r, weather, traffic, transit, now: NOW });
  return createPredictionSnapshot({ risk, requestedMode: "car", timePreference: "leaveAt", selectedTripTime: NOW, weather, traffic, transit, predictionId: "fixture-low-disruption-car" });
}

export function moderateTrafficCarCase(): PredictionSnapshot {
  const r = driveRoute();
  const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 12, precipitationMm: 0 })])] });
  const traffic = trafficResult({
    trafficAnalysis: {
      status: "analyzed",
      analysis: trafficAnalysis({
        trafficDelayMinutes: 8,
        intervals: [
          { startPolylineIndex: 0, endPolylineIndex: 1, condition: "normal", distanceMeters: 15000 },
          { startPolylineIndex: 1, endPolylineIndex: 2, condition: "slow", distanceMeters: 6000 },
        ],
      }),
    },
  });
  const transit = transitAnalysis({ status: "not-applicable", reason: "no transit segments" });
  const risk = computeCommuteRisk({ route: r, weather, traffic, transit, now: NOW });
  return createPredictionSnapshot({ risk, requestedMode: "car", timePreference: "leaveAt", selectedTripTime: NOW, weather, traffic, transit, predictionId: "fixture-moderate-traffic-car" });
}

export function precipitationCase(): PredictionSnapshot {
  const r = driveRoute();
  const weather = weatherAnalysis({ samples: [weatherSample("s1", [forecast({ temperatureC: 6, precipitationMm: 7, windSpeedKmh: 22 })])] });
  const traffic = trafficResult({ trafficAnalysis: { status: "analyzed", analysis: trafficAnalysis({ trafficDelayMinutes: 3 }) } });
  const transit = transitAnalysis({ status: "not-applicable", reason: "no transit segments" });
  const risk = computeCommuteRisk({ route: r, weather, traffic, transit, now: NOW });
  return createPredictionSnapshot({ risk, requestedMode: "car", timePreference: "leaveAt", selectedTripTime: NOW, weather, traffic, transit, predictionId: "fixture-precipitation-car" });
}

export function transitScheduleOnlyCase(): PredictionSnapshot {
  const r = transitRoute();
  const weather = weatherAnalysis({ samples: [weatherSample("w1", [forecast({ temperatureC: 10 })]), weatherSample("b1", [forecast({ temperatureC: 9 })])] });
  const traffic = trafficResult({ trafficAnalysis: { status: "not-applicable", reason: "bus" } });
  const transit = transitAnalysis({
    transitSegments: [transitSegmentAnalysis({ routeSegmentId: "b1", status: "matched-schedule-only", match: { quality: "exact", routeId: "R1", tripId: "T1", serviceId: "S1", evidence: ["Route short name matched."] } })],
  });
  const risk = computeCommuteRisk({ route: r, weather, traffic, transit, now: NOW });
  return createPredictionSnapshot({ risk, requestedMode: "bus", timePreference: "leaveAt", selectedTripTime: NOW, weather, traffic, transit, predictionId: "fixture-transit-schedule-only" });
}

export const REAL_CASE_FIXTURES = {
  lowDisruptionCar: lowDisruptionCarCase,
  moderateTrafficCar: moderateTrafficCarCase,
  precipitation: precipitationCase,
  transitScheduleOnly: transitScheduleOnlyCase,
};
