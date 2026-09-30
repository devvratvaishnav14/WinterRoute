import type { RoadEventSeverity, RoadEventType } from "@/lib/traffic/types";
import type { TransitAlertEffect } from "@/lib/transit/types";
import type { RiskFactorKey } from "./types";

/**
 * Every heuristic threshold/weight WinterRoute V0's risk model uses,
 * centralized here on purpose — see docs/decisions/0008-risk-model-v0.md
 * "Centralized threshold configuration." Nothing in `lib/scoring/` should
 * contain an inline magic number; if a scoring function needs a
 * threshold, it belongs here, named and documented.
 *
 * Every numeric value below is a deliberate, documented V0 starting
 * point, not a validated constant — there is no historical outcome data
 * yet to calibrate against (see "No claim of accuracy" in the same ADR).
 */

/** A piecewise-linear scoring curve: 0 below `lowValue`, 100 at/above `highValue`, linear between. */
export interface LinearScoreCurve {
  lowValue: number;
  highValue: number;
}

export function scoreOnCurve(value: number, curve: LinearScoreCurve): number {
  if (curve.highValue <= curve.lowValue) return value >= curve.highValue ? 100 : 0;
  const fraction = (value - curve.lowValue) / (curve.highValue - curve.lowValue);
  return Math.max(0, Math.min(100, fraction * 100));
}

/** The inverse of `scoreOnCurve` — for metrics where *lower* is worse (e.g. visibility). 100 at/below `lowValue`, 0 at/above `highValue`. */
export function scoreOnInverseCurve(value: number, curve: LinearScoreCurve): number {
  return 100 - scoreOnCurve(value, curve);
}

export const riskModelV0Config = {
  modelVersion: "winterroute-risk-v0" as const,

  weather: {
    freezingThresholdC: 0,
    /** A forecast temperature within this many degrees above freezing, alongside precipitation, is flagged "precipitation near freezing" (possible freezing rain/mixed precipitation) — deliberately not asserted as ice. */
    nearFreezingBufferC: 2,
    /** Minimum forecast snowfall (any model) to flag `snowfallPresent`. */
    notableSnowfallCm: 0.2,
    /** Minimum forecast precipitation (any model) to count a segment/sample as "exposed to notable weather" for exposure-share purposes. */
    notablePrecipitationMm: 0.5,

    precipitationCurve: { lowValue: 0, highValue: 15 } satisfies LinearScoreCurve, // mm
    snowfallCurve: { lowValue: 0, highValue: 8 } satisfies LinearScoreCurve, // cm
    windCurve: { lowValue: 15, highValue: 60 } satisfies LinearScoreCurve, // km/h
    visibilityCurve: { lowValue: 1, highValue: 10 } satisfies LinearScoreCurve, // km — inverse (lower visibility = higher score)
    coldExposureCurve: { lowValue: 0, highValue: -15 } satisfies LinearScoreCurve, // °C — inverse direction handled in scoring
    freezingBonus: 15, // flat addition when belowFreezingTemperature is true (not a separate normalized contributor, a corroborating bump)
    alertBonus: 20, // flat addition per relevant, distinct ECCC alert type present, capped by alertBonusCap
    alertBonusCap: 40,

    /**
     * How strongly each weather phenomenon matters for a given ACTUAL
     * segment mode (`SegmentTransportMode`) — see docs/architecture.md
     * "Mode-aware weather exposure." `rail` is deliberately near-zero:
     * SkyTrain itself is largely weather-protected; its own disruption
     * risk is a transit concern (`transit` factor), not a weather one.
     * `bus` is moderate: the vehicle itself has some road-weather
     * sensitivity, but the "exposed walking portion" of a transit trip is
     * already its own separate `walk` segment scored on its own terms.
     */
    modeSensitivity: {
      walk: { precipitation: 1.0, snow: 1.0, freezing: 1.0, wind: 1.0, visibility: 0.7, cold: 0.8 },
      cycle: { precipitation: 1.0, snow: 1.0, freezing: 1.0, wind: 1.0, visibility: 0.7, cold: 0.5 },
      drive: { precipitation: 0.8, snow: 1.0, freezing: 0.9, wind: 0.2, visibility: 0.9, cold: 0.1 },
      bus: { precipitation: 0.4, snow: 0.6, freezing: 0.5, wind: 0.15, visibility: 0.5, cold: 0.1 },
      rail: { precipitation: 0.05, snow: 0.05, freezing: 0.05, wind: 0.05, visibility: 0.05, cold: 0.05 },
    } satisfies Record<string, Record<string, number>>,
  },

  traffic: {
    delayCurve: { lowValue: 0, highValue: 20 } satisfies LinearScoreCurve, // minutes
    trafficJamShareWeight: 40,
    slowShareWeight: 15,
  },

  roadEvents: {
    severityWeight: {
      minor: 15,
      moderate: 35,
      major: 70,
      unknown: 20,
    } satisfies Record<RoadEventSeverity, number>,
    typeMultiplier: {
      incident: 1.0,
      construction: 0.6,
      specialEvent: 0.5,
      weatherCondition: 0.8,
      roadCondition: 0.8,
      unknown: 0.7,
    } satisfies Record<RoadEventType, number>,
    /** After the single worst event sets the base score, each additional qualifying event adds this much, capped by `additionalEventCap`. */
    additionalEventBonus: 6,
    additionalEventCap: 20,
  },

  transit: {
    delayCurve: { lowValue: 0, highValue: 15 } satisfies LinearScoreCurve, // minutes
    /**
     * Deliberately the curve's own maximum (100), not merely "high" —
     * discovered during scenario-matrix validation that a value below
     * the delay curve's ceiling let an extreme-but-still-running delay
     * (saturating `delayCurve` at 100) outrank an actual cancellation,
     * which is backwards: a rider can eventually complete a badly
     * delayed trip, but not a canceled one on that specific service. A
     * cancellation must never score at or below what a mere delay can
     * reach.
     */
    canceledTripScore: 100,
    skippedStopScore: 45,
    /** Alert `effect` severity, 0-100 — a full suspension matters far more than a minor informational effect. Centralized and documented as a V0 heuristic, not derived from any TransLink-published severity scale (none exists). */
    alertEffectSeverity: {
      noService: 90,
      significantDelays: 70,
      reducedService: 55,
      detour: 45,
      modifiedService: 35,
      stopMoved: 20,
      otherEffect: 25,
      accessibilityIssue: 15,
      additionalService: 5,
      noEffect: 0,
      unknown: 20,
    } satisfies Record<TransitAlertEffect, number>,
  },

  overall: {
    /**
     * How relevant each factor is for an ACTUAL segment mode — the basis
     * for the overall index's mode/duration-weighted factor weighting
     * (docs/architecture.md "Overall score weighting"). A mixed route's
     * final weighting is the duration-weighted average of these across
     * its real segments, then renormalized over whichever factors are
     * actually applicable for this specific trip (see
     * `overallRisk.ts`) — never diluted by a factor that doesn't apply.
     */
    modeFactorRelevance: {
      walk: { weather: 1.0, traffic: 0, transit: 0, roadEvents: 0.3 },
      cycle: { weather: 1.0, traffic: 0.3, transit: 0, roadEvents: 0.5 },
      drive: { weather: 0.6, traffic: 1.0, transit: 0, roadEvents: 0.8 },
      bus: { weather: 0.3, traffic: 0, transit: 1.0, roadEvents: 0.3 },
      rail: { weather: 0.1, traffic: 0, transit: 1.0, roadEvents: 0.1 },
    } satisfies Record<string, Record<RiskFactorKey, number>>,

    /** Upper (exclusive) bound of each label band — e.g. a score of 54.9 is "Moderate", 55 is "High". */
    labelThresholds: {
      low: 30,
      moderate: 55,
      high: 75,
    },
  },

  sufficiency: {
    /**
     * The factor(s) considered essential for a trip actually using this
     * segment mode — a route's overall essential set is the UNION of
     * these across every distinct segment mode it actually contains (see
     * `sufficiency.ts`). If NONE of a route's essential factors could be
     * scored, there is no defensible basis for an index at all
     * (`"insufficient-data"`) — regardless of what supplementary data
     * happens to be present. A mixed walk+bus trip's essential set is
     * {weather, transit}: losing transit entirely (e.g. GTFS static
     * itself failed) is just as disqualifying as losing weather.
     */
    essentialFactorsByMode: {
      walk: ["weather"],
      cycle: ["weather"],
      drive: ["weather", "traffic"],
      bus: ["transit"],
      rail: ["transit"],
    } satisfies Record<string, RiskFactorKey[]>,
  },
};

export type RiskModelV0Config = typeof riskModelV0Config;
