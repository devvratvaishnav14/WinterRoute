/**
 * Every heuristic threshold/allowance WinterRoute's V0 duration model
 * uses, centralized here — same discipline as
 * `lib/scoring/config.ts`. Every numeric value below is an explicit,
 * documented V0 starting point, EXPERIMENTAL AND PENDING CALIBRATION —
 * there is no historical predicted-vs-actual outcome dataset yet to
 * validate any of these against. See
 * docs/decisions/0010-duration-model-v0.md.
 */
export const durationModelV0Config = {
  modelVersion: "winterroute-duration-v0" as const,

  /**
   * Walking/cycling weather effects are, by explicit instruction,
   * conservative and mostly UNCERTAINTY-widening rather than
   * central-estimate-shifting — V0 has no calibrated basis for claiming
   * "snow slows a walker by exactly N%." `centralAdjustmentMinutes` is
   * deliberately 0 for every condition below; only the upper bound
   * widens. Widening scales with the segment's own baseline duration
   * (a 5-minute walk and a 45-minute walk shouldn't get the same flat
   * allowance) and is capped per segment.
   */
  walk: {
    conditions: { meaningfulSnowfallCm: 1, heavyPrecipitationMm: 8, freezingThresholdC: 0, severeWindKmh: 40 },
    centralAdjustmentMinutes: 0,
    /** Minutes of upper-bound widening per hour of the segment's own baseline duration, per condition present — summed when multiple apply, then capped. */
    upperWideningMinutesPerHour: { snow: 6, freezing: 3, heavyPrecipitation: 4, severeWind: 3, severeAlert: 8 },
    maxUpperWideningMinutes: 15,
  },

  cycle: {
    conditions: { meaningfulSnowfallCm: 0.5, heavyPrecipitationMm: 6, freezingThresholdC: 0, severeWindKmh: 35 },
    centralAdjustmentMinutes: 0,
    upperWideningMinutesPerHour: { snow: 10, freezing: 5, heavyPrecipitation: 5, severeWind: 6, severeAlert: 12 },
    maxUpperWideningMinutes: 20,
  },

  car: {
    /**
     * Near-term car trips already have Google's own traffic-aware
     * measurement, which itself reflects real conditions including some
     * weather-driven slowdown when the trip is close enough — so
     * near-term weather widening stays small (uncertainty only, no
     * central shift) to avoid double-counting congestion Google already
     * measured. Far-future trips rely on Google's historical/pattern
     * estimate, which does NOT reflect a specific future storm, so
     * far-future weather widening is larger — see "Weather effect on car
     * duration" in the ADR.
     */
    nearTermWeatherUpperWideningMinutes: { snow: 4, freezing: 2, heavyPrecipitation: 3 },
    futureWeatherUpperWideningMinutes: { snow: 12, freezing: 6, heavyPrecipitation: 7 },
    /** Applied only when NO traffic data is available at all — proportional to baseline, capped. */
    noTrafficUpperWideningMinutesPerHour: 8,
    maxNoTrafficUpperWideningMinutes: 20,
    /** Road events with no quantitative delay info: uncertainty widening only, keyed by severity. */
    roadEventUpperWideningMinutes: { minor: 2, moderate: 5, major: 12 },
  },

  transit: {
    /** A minimum assumed transfer buffer even for a same-stop transfer — real transfers are never instantaneous. */
    transferBufferMinimumSeconds: 60,
    /** Applied when a matched segment has no realtime at all — a small, honest acknowledgment that "on schedule" isn't confirmed, not a claim of a specific delay. */
    scheduleOnlyUpperWideningMinutes: 5,
    /** Applied when a service alert exists but carries no quantifiable delay information. */
    alertUpperWideningMinutes: { minor: 5, major: 15 },
    /**
     * Applied (to the upper bound only) when a missed connection or
     * cancellation is detected and no defensible alternative itinerary
     * can be computed — deliberately large, since the real gap could be
     * anywhere from "the next scheduled run in a few minutes" to "the
     * next run in an hour," and V0 does not attempt to determine which
     * (see "Missed connection handling" in the ADR).
     */
    disruptionUpperWideningMinutes: 30,
  },

  horizon: {
    /** Small additional upper-bound widening scaling with how far out the trip is — never a fabricated confidence percentage, just an acknowledgment that farther-out estimates rest on less immediate evidence. */
    perHourUpperWideningMinutes: 0.12,
    maxUpperWideningMinutes: 20,
  },
};

export type DurationModelV0Config = typeof durationModelV0Config;
