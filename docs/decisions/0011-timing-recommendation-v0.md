# 0011 — Recommended departure / expected arrival model (V0)

**Date:** 2026-09-27

## Context

WinterRoute's first timing-recommendation model — converts the existing
baseline route, `ExpectedCommuteDurationV0`, and the user's selected
Arrive By / Leave At preference into a concrete action: "leave by X" or
"expect to arrive Y-Z." Explicitly must NOT use the risk index as a
timing input. Deep rationale for individual mechanisms lives in
`docs/architecture.md` "Recommended departure / expected arrival model
(V0)"; this records the decisions and the real bug found while building
the evaluation-snapshot extension.

## Why the risk index cannot affect timing

`computeTimingRecommendation`'s parameters are `{ duration, preference,
targetTime, now }` — there is no risk-score parameter anywhere in the
call chain, so the risk index influencing timing is structurally
impossible, not merely policy-forbidden. Proven directly:
`computeTimingRecommendation.test.ts`'s "independence from the risk
index" test computes two real, wildly different risk indices (clear
weather vs. severe snow, confirmed >20 points apart) for the same route,
then confirms the timing output is byte-identical regardless, since
timing only ever sees the duration prediction.

## Decisions

- **Arrive By uses the duration model's UPPER bound**:
  `recommended = target - upperBound`. The upper bound already contains
  factual traffic/realtime effects, modeled uncertainty, forecast-horizon
  widening, weather uncertainty, and road-event uncertainty (established
  in the duration-model stage) — adding a further arbitrary safety buffer
  on top would double-count uncertainty already accounted for.
- **A conservative cap**: `recommended = min(target - upperBound, target
  - baseline)` — WinterRoute never recommends leaving LATER than the
  typical departure, even when the duration model's upper bound is
  genuinely faster than baseline (a real, confirmed case from the
  duration stage). This is a deliberate product rule, not a modeling
  necessity: conditions can change between the recommendation and the
  actual trip, and "traffic is light right now, leave later" is exactly
  the kind of advice that ages badly. Verified live (Vancouver→Burnaby,
  genuinely 5-7 min faster than baseline): capped correctly, `0 min
  earlier`, "usual departure timing should be sufficient."
- **Leave At produces an arrival range, never a recommendation** — no
  cap, no missed-window concept, since a user-selected departure is a
  planning input, not a deadline WinterRoute can second-guess.
- **Floor-to-minute for "leave by" times, round-to-nearest for arrival
  times** (`lib/timing/roundTime.ts`) — rounding a "leave by"
  recommendation UP would silently erode its own safety margin.
- **All timing arithmetic is absolute epoch-millisecond math**, never
  clock-string manipulation — this is what makes midnight crossings and
  DST transitions correct without any special-case code, only tests that
  prove it (spring-forward, fall-back, a post-midnight arrival target
  producing a previous-calendar-day recommended departure).
- **Missed-window detection uses strict `<`, not `<=`**, against `now`
  floored to the minute — the same minute-flooring discipline
  established (and previously regression-caught) in the trip-validation
  and traffic stages: a recommendation landing exactly on the current
  minute is still actionable.
- **The "leave now" fallback is withheld when the underlying analysis is
  stale** (`config.staleAnalysisToleranceMinutes`, 15 min, relative to
  `ExpectedCommuteDurationV0.analyzedAt`) — a deliberate, documented
  limitation: this pure function cannot re-fetch live provider data, so
  refusing to reuse old traffic/realtime evidence past a threshold is the
  honest choice, not presenting stale timing as current.
- **Status propagation**: `insufficient-data`/`route-disrupted`
  short-circuit before any departure math; `limited-data` still produces
  a recommendation (flagged); `departure-window-missed` (Arrive By only)
  takes priority in the reported status once detected, with the
  underlying data-quality reason preserved separately in
  `statusReasons`. Confirmed live: both states co-occurred naturally in
  one real test (a near-current car trip with transiently unavailable
  traffic data AND an already-passed recommended departure).
- **`lib/timing/` has its own `modelVersion`
  (`"winterroute-timing-v0"`) and independent config fingerprint**,
  reusing the risk/duration models' generic stringify/hash helpers —
  timing's own decision rules (the cap, missed-window handling) may
  evolve independently of duration-v0's arithmetic.
- **`PredictionSnapshot` gained an OPTIONAL `timingRecommendation`
  field** — same additive, non-breaking pattern as the duration
  extension.

## A real bug found while extending the evaluation snapshot

Adding `timingRecommendation` to `PredictionSnapshot` surfaced a genuine
serialization bug: `timingRecommendation` carries several `Date` fields
(`targetOrDepartureTime`, `recommendedDepartureTime`,
`expectedArrivalWindow.{lower,central,upper}`), and the initial version
of `lib/evaluation/serialization.ts` relied on its generic object
spread (`...snapshot`) to carry the field through — which serializes a
`Date` to an ISO string via `JSON.stringify`'s native behavior on the way
OUT, but does NOT revive that string back into a `Date` instance on the
way back IN (`fromSerializable` has no generic Date-revival logic by
design, matching the project's established "explicit, typed revival,
nothing generic" convention). Round-tripping a snapshot with a timing
recommendation would have silently left those fields as strings instead
of `Date` objects. Fixed by adding the same explicit ISO-string
conversion/revival already used for every other nested Date group in the
snapshot (`tripContext`, `featureSnapshot.temporal`,
`sourceFreshness.transitFeedTimestamps`). Caught by
`timingSnapshot.test.ts`'s round-trip test, which explicitly asserts
`instanceof Date` after deserialization — not by inspection.

## Consequences

- `docs/architecture.md` gained a full "Recommended departure / expected
  arrival model (V0)" section; "Explicitly deferred" was updated to
  reflect that recommended departure now exists (as a V0 heuristic, not
  a final feature).
- `lib/evaluation/types.ts`/`serialization.ts`/`privacy.ts`/`createSnapshot.ts`
  extended for `timingRecommendation`, verified non-breaking for
  pre-existing snapshots (with or without a duration prediction).
- Next stage's natural scope, per the project brief's own sequencing, is
  consolidating the development-preview stack into a final results
  experience — still explicitly not built yet, pending approval.
- Verified with the full test suite (705 tests passing, including 17
  Arrive-By tests — formula, cap, rounding, missed-window at the exact
  boundary, leave-now staleness, midnight, and both DST transitions — 8
  Leave-At tests, 11 orchestration/independence/counterfactual tests, and
  5 evaluation-snapshot round-trip tests), `next lint`, `tsc --noEmit`,
  `next build`, and a live testing run against real weather/traffic/
  transit APIs covering SFU→Surrey (car and transit, Arrive By),
  Vancouver→Burnaby (car, Leave At and Arrive By), a walking trip, a
  cycling trip, near-current/tomorrow/near-72h horizons, and a genuine
  faster-than-baseline case — see the conversation's final report for
  full results, including a real transit trip that naturally hit
  `departure-window-missed` during testing.
