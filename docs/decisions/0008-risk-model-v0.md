# 0008 — Feature engineering & experimental commute-risk index (V0)

**Date:** 2026-09-26

## Context

With location search, baseline + traffic-aware routing, multi-model
weather + official alerts, DriveBC road events, and TransLink GTFS static
+ GTFS-Realtime all integrated as factual data layers, this stage builds
WinterRoute's first data-science layer: a provider-neutral feature
pipeline and an interpretable heuristic "WinterRoute Commute Risk Index
V0." Per the project brief, this is explicitly NOT machine learning —
there is no historical predicted-vs-actual outcome dataset yet, and
training one now would mean inventing labels. Deep rationale for
individual mechanisms lives in `docs/architecture.md` "Feature
engineering & experimental risk model (V0)"; this records the decisions,
the bus-fullness removal, and the required "no claim of accuracy" framing
in one place.

## Decisions

- **Distinct layers, never scoring raw provider data.** Route + weather +
  traffic + transit → `SegmentFeatureSet`/`CommuteFeatureSet`
  (`lib/scoring/*Features.ts`) → `FactorScore` per factor
  (`lib/scoring/*Score.ts`) → `ExperimentalCommuteRiskV0`
  (`lib/scoring/overallRisk.ts`, `explanation.ts`,
  `computeCommuteRisk.ts`). `computeCommuteRisk` is pure and
  deterministic — no fetching, no I/O — and runs entirely client-side in
  `TripForm.tsx` once weather/traffic/transit have all settled, since
  it's a transformation of already-fetched data.
- **All heuristic thresholds/weights centralized in
  `lib/scoring/config.ts` (`riskModelV0Config`)** — curves, mode
  sensitivities, alert-effect severities, road-event severity/type
  weights, and the mode/factor relevance table. Every numeric heuristic
  is discoverable in one place, none scattered inline.
- **Piecewise-linear scoring curves** (`scoreOnCurve`/`scoreOnInverseCurve`,
  bounded 0-100, monotonic by construction) for continuous quantities
  (precipitation, snowfall, wind, visibility, traffic delay, transit
  delay) rather than binary threshold cliffs.
- **A segment's weather severity combines phenomena by `max`, not sum** —
  correlated phenomena describing one storm (heavy snow + a freezing
  temperature) don't stack into an inflated total. The same "combine by
  max" principle applies to transit disruption signals (delay,
  cancellation, skipped stop, alert severity), with one explicit,
  documented exception: the cancellation floor (below). Traffic's
  jam/slow route-share and road events' "additional event" bonus are
  capped, corroborating additions on top of a dominant primary signal,
  not independent full-scale severity — see "Avoiding double counting" in
  `docs/architecture.md`.
- **The cancellation floor.** Per the brief, "a factual canceled matched
  transit trip is a major disruption signal... the score may reflect this
  strongly" — implemented as `max(combinedScore, canceledTripScore)`,
  never diluted by averaging with an unrelated minor signal on the same
  trip.
- **Mode-aware weather exposure** via `config.weather.modeSensitivity`,
  keyed by the segment's ACTUAL mode (`walk`/`cycle`/`drive`/`bus`/`rail`),
  not the user's single originally-requested mode.
- **Duration-based exposure weighting**, not distance-based — a
  segment's influence on the route-level weather average is its share of
  total route *duration*. A segment with no weather data is excluded from
  both the numerator and denominator, never treated as zero severity.
- **Overall index weighting is mode/duration-weighted across the route's
  real segments** (`config.overall.modeFactorRelevance`,
  `computeRawFactorWeighting`) — a mixed trip's weighting reflects its
  actual segment composition, not just the single selected mode.
- **Normalization happens only over `"scored"` factors.** A
  `"not-applicable"` or `"unavailable"` factor is dropped from both the
  numerator and denominator — never averaged in as an implicit zero,
  which would artificially understate risk for exactly the trips where a
  factor's absence matters most (a pure walk trip's index is not diluted
  by traffic/transit both counting as "0/100").
- **`DataCoverage` is reported separately from severity**, never folded
  into a single confidence percentage — a low index from complete data
  and a low index from mostly-unavailable data are numerically
  identical unless a caller also checks `dataCoverage`, so the risk
  preview always shows both.
- **Deterministic, template-based explanations** (`lib/scoring/explanation.ts`)
  — no LLM, no randomized prose, one sentence per applicable factor built
  directly from its own engineered values. Dominant factors are the top
  2-3 contributors by weighted contribution, named by their most specific
  driving sub-factor.
- **The index is explicitly not a probability.** `overallIndex: 78` means
  "relatively high disruption severity under this transparent heuristic
  model," never "78% chance of disruption" — stated in `types.ts`'s doc
  comment, the risk preview's own on-screen text, and here.

## Bus/vehicle crowding: removed from V1 entirely

Per explicit instruction: WinterRoute V1 will not build occupancy UI,
crowding probability, bus-fullness prediction, inferred crowding, or any
placeholder crowding field. This is a deliberate, evidence-based scope
decision, not an oversight — TransLink's real GTFS-Realtime Vehicle
Positions feed was confirmed, during the transit stage, to publish no
usable `occupancy_status`/`occupancy_percentage` data at all (0 of 805
real vehicle entities had true wire-presence for either field, verified
via `Object.prototype.hasOwnProperty` after an initial naive `!= null`
check gave a false positive — see
`docs/decisions/0007-transit-data-integration.md` and
`docs/data-sources.md`). That finding is preserved in both of those
documents rather than deleted, since it's a useful, real result in its
own right. Nothing in `lib/scoring/` or any UI component references
occupancy, crowding, or fullness in any form.

## Avoiding double counting (why this got its own section)

The brief called this out as critical, and it's the single easiest way
for a heuristic model to look "more confident than it should" by
counting one real-world event through multiple correlated signals. Every
place this project has more than one signal describing the same
underlying phenomenon, the design explicitly combines them by taking the
dominant one and adding only a small, capped bonus for the rest — see
"Avoiding double counting" in `docs/architecture.md` for the full list
(weather phenomena, traffic delay vs. jam share, road event count vs.
severity, transit disruption signals). This is tested directly:
`computeCommuteRisk.test.ts`'s "counterfactual isolation" tests confirm
that changing only one factor's underlying evidence (e.g. traffic delay)
changes only that factor's score, never an unrelated one.

## No claim of accuracy

This is the most important limitation to state plainly: **V0 has not
been validated against any real observed commute outcome.** No historical
predicted-vs-actual dataset exists yet. The model is an interpretable
heuristic risk index intended to establish the feature pipeline and
generate testable predictions for future calibration — not a claim of
accuracy, and never described as one anywhere in the UI or documentation.

## Future validation design (not implemented yet)

Conceptually, once this stage is running in front of real trips:

1. At prediction time, save the feature snapshot (`CommuteFeatureSet`)
   and the V0 score together.
2. After the commute window passes, collect an actual observable outcome
   (real delay, disruption, cancellation) — a source for this doesn't
   exist yet either.
3. Compare predicted severity against observed outcome, and evaluate
   calibration, rank correlation, per-mode error, per-weather-condition
   error, and per-forecast-horizon error.

No persistence for this exists yet — deliberately, per this stage's
explicit "do not build a database yet" instruction.

## Known weaknesses of V0

- **No real calibration** — every curve/weight/threshold in
  `riskModelV0Config` is a documented starting point, not a validated
  constant (see "No claim of accuracy" above).
- **The degenerate all-unavailable case returns 0 ("Low")** purely
  because there's nothing to sum, which reads as "confirmed low risk"
  rather than "no evidence available" unless a caller also checks
  `dataCoverage`. Documented in `overallRisk.ts`'s doc comment; not fixed
  with an invented "unknown" numeric encoding, since the brief requires
  the index stay a plain bounded 0-100 number.
- **Segment-level traffic features mirror the whole route's traffic
  analysis** rather than a genuine per-segment breakdown — Google's
  traffic-aware response has no finer granularity than the whole DRIVE
  route in the current domain model.
- **Road-event scoring works from pre-aggregated counts, not the raw
  event list** — the dominant event's exact type isn't preserved as a
  feature, so its type-multiplier is approximated by blending the
  category counts rather than reading the actual dominant event's type
  directly.
- **`closureCount` doesn't exist as a literal feature** — DriveBC's
  schema has no explicit closure flag; `majorSeverityEventCount` is used
  as the closest defensible proxy, documented as such rather than
  invented.

## What would help calibrate/replace the heuristics later

A dataset of (feature snapshot, V0 score) pairs alongside real observed
commute outcomes (actual delay, actual disruption/cancellation, whether a
transfer was missed) across a range of weather conditions, traffic
conditions, transit disruption states, and forecast horizons — see
"Future validation design" above. Until that exists, no part of this
model should be described as validated.

## Consequences

- `docs/architecture.md` gained a full "Feature engineering &
  experimental risk model (V0)" section, and its "Explicitly deferred" /
  "Open questions" sections were updated to reflect that this layer now
  exists (as a heuristic index, not a prediction).
- Next stage's natural scope, per the project brief's own sequencing, is
  NOT expected-commute-duration prediction, recommended departure, ML, a
  map, or a final polished results page — all still explicitly withheld.
  A defensible next step is validating/refining V0 against more live
  scenarios, or beginning to design the future outcome-collection
  mechanism this ADR describes conceptually but doesn't build.
- Verified with the full test suite (457 tests passing, including
  synthetic sanity cases A-E, monotonic property tests, mode-sensitivity
  tests, missing-data tests, counterfactual isolation tests, and a
  scenario-distribution sweep), `next lint`, `tsc --noEmit`, `next build`,
  and a live validation run against real current weather/traffic/transit
  data across SFU→Surrey (car and transit), Vancouver→Burnaby (car), a
  walking trip, a cycling trip, a same-day trip, a next-day trip, and a
  near-72h trip — see the conversation's final report for the full
  results.
