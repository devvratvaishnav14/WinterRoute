# 0010 — Expected commute duration model (V0)

**Date:** 2026-09-27

## Context

WinterRoute's first expected-commute-duration model — a SEPARATE
prediction from `ExperimentalCommuteRiskV0`. The risk index answers "how
disruption-prone does this commute look" (severity); this model answers
"given currently available evidence, how long should this journey
reasonably take" (a time range). Like the risk model, there is still no
historical predicted-vs-actual outcome dataset large enough to train or
calibrate a real model, so this is another interpretable V0 hybrid, not
ML. Deep rationale for individual mechanisms lives in `docs/architecture.md`
"Expected commute duration model (V0)"; this records the decisions, the
real bug found while building it, and the required documentation list in
one place.

## Risk vs. duration: why two models

Both call the same `buildCommuteFeatures` step (identical factual
weather/traffic/transit/road-event aggregates), but diverge completely
from there: the risk model combines per-factor SEVERITY scores into an
index; the duration model performs TIMING arithmetic (baseline + factual
deltas + bounded heuristic ranges). Neither reads the other's output —
`computeExpectedDuration.test.ts`'s "independence from the risk model"
test proves this with a concrete counterexample: identical car trips
where heavy snow (weather is uncertainty-only for car duration, so its
duration effect is small) produces a HIGHER risk index but a SHORTER
expected duration than a clear-weather trip carrying a real 8-minute
traffic delay.

## Decisions

- **`DelayContribution` carries three deltas** (`centralMinutes`/
  `lowerMinutes`/`upperMinutes`), not one number — so a contribution can
  widen uncertainty without shifting the central estimate. Per explicit
  instruction, nearly every weather/road-event/alert heuristic has
  `centralMinutes: 0`; only directly-measured evidence (Google traffic-
  aware timing, TransLink realtime delay) shifts the central estimate.
- **Provenance is tracked per contribution** (`observed-provider` /
  `scheduled-provider` / `derived` / `heuristic-v0`) — a Google traffic
  delay is never presented as equivalent to a heuristic snow allowance.
- **Car duration uses Google's `trafficAwareDurationMinutes` directly as
  the central basis**, not `baseline + max(0, delta)`. This lets the
  central estimate legitimately fall below a static baseline when real
  traffic is genuinely lighter — confirmed live (SFU→Surrey: baseline
  28min, real central estimates of 24-26min across several checks,
  genuinely faster). Road-event and traffic-condition shares are never
  added as separate minutes on top of Google's own delay figure, to avoid
  double-counting the same congestion.
- **Near-term vs. future weather widening for car trips are configured
  separately** and confirmed different (~3x more widening far out) —
  near-term Google traffic data already reflects some real weather
  slowdown; far-future data is pattern-based and doesn't know about a
  specific storm.
- **Transit timeline propagation checks for a missed connection only
  when the earlier leg has realtime evidence** — a schedule-only
  itinerary is trusted as internally consistent (Google/TransLink
  planned it as joinable); only new realtime evidence can show a planned
  connection has actually broken.
- **No live GTFS re-query for a genuine alternate itinerary** on a missed
  connection or cancellation. The project brief explicitly permits "if
  the next departure cannot be determined reliably, increase uncertainty
  ... rather than inventing a connection" — implementing a real
  next-departure lookup would require moving duration computation
  server-side and adding a new GTFS-querying capability, out of scope for
  this V0 stage. Both cases instead set `predictionStatus:
  "route-disrupted"` and apply a large, capped uncertainty widening.
- **Walking/cycling weather effects are `centralMinutes: 0` for every V0
  condition** — no calibrated basis exists for an exact speed reduction.
  Widening scales with the segment's own baseline duration and is capped
  per mode.
- **Road-event widening applies at the whole-route level regardless of
  mode** — a real event is physically real whichever way someone
  travels.
- **Range invariants are enforced unconditionally** in `combineContributions`
  (`lib/duration/combine.ts`): `lowerBound >= 0`, `lowerBound <=
  centralEstimate <= upperBound`, via clamping that only floors at 0 —
  never forcing the central estimate upward, which is what preserves the
  "can legitimately be faster than baseline" property above.
- **The range is allowed to be asymmetric on purpose** — nearly every V0
  heuristic effect only widens the upper bound, since commute delays skew
  upward far more than trips run dramatically early. A symmetric `±N`
  band was deliberately rejected as false precision.
- **Duration sufficiency rules differ from risk sufficiency** — weather
  may be essential to a walking RISK score, but baseline routing alone
  still gives a defensible DURATION estimate without it. The "primary
  timing evidence" per mode is narrower: drive needs traffic; bus/rail
  need the transit analysis to have succeeded at all (schedule-only is
  normal, not degraded); walk/cycle need nothing beyond baseline.
- **`PredictionSnapshot` gained an OPTIONAL `durationPrediction` field**
  — purely additive, so an older snapshot (predating the duration model)
  stays a fully valid `PredictionSnapshot` with the field simply absent,
  no breaking version bump. The duration model has its own independent
  `modelVersion` (`"winterroute-duration-v0"`) and `configFingerprint`
  (reusing the risk model's generic hash helpers rather than duplicating
  them).

## No negative commute — what's clamped and what isn't

Two different things, deliberately kept distinct:

- **`centralEstimateMinutes` vs. `baselineDurationMinutes`**: NOT forced
  to be central ≥ baseline. A genuinely faster-than-typical real traffic
  measurement can and should produce a central estimate below baseline —
  confirmed live. Forcing this upward would mean discarding real evidence
  to preserve an appearance of "delay," which the project brief
  explicitly warns against ("do not artificially force all factual
  journey estimates upward unless the baseline definition requires it").
- **`directlyObservedDelayMinutes`** (the top-level display summary
  field): clamped to non-negative. This is what's shown as "+7 min
  traffic" in the UI — it must never render as "-4 min delay," which
  would misleadingly suggest bad conditions improved the commute. The
  underlying central-vs-baseline relationship stays fully honest either
  way; only this one summary field is clamped for presentation.

## A real bug found by live testing (not the scenario matrix, this time)

Running the CLI scenario matrix (`npm run duration-scenarios`) surfaced a
genuine bug: `buildCarContributions` unconditionally added a "No traffic
data available" uncertainty-widening contribution whenever
`traffic.availability !== "available"` — including for a PURE TRANSIT
route with no `drive` segment at all, where `traffic.availability` is
correctly `"not-applicable"` (not a failure, just genuinely irrelevant).
A bus-only itinerary was showing an unexplained car-traffic-uncertainty
line that made no sense for a trip with no driving in it. Fixed by
returning immediately (no contribution at all) when
`traffic.availability === "not-applicable"`, before falling into the
"traffic data is missing" branch — which now only fires when a `drive`
segment genuinely exists but its traffic data failed to load. Caught by
manually reading the CLI's real output for a transit scenario, not by an
existing automated test — a reminder that even a thorough test suite
benefits from actually reading a tool's real output end to end. A second,
minor bug (a doubled "the the rail leg" in the missed-connection
explanation sentence) was found the same way and fixed alongside it.

## Documentation

Covered across `docs/architecture.md` "Expected commute duration model
(V0)" and this ADR: risk-vs-duration distinction, factual-vs-heuristic
delay representation, baseline definition (unchanged, reused as-is), car
traffic treatment, transit timeline propagation, missed-transfer logic,
cancellation behavior, walking/cycling weather uncertainty, weather/
traffic double-counting prevention, road-event treatment, horizon
uncertainty, range construction, prediction statuses, model/config
versioning, evaluation-snapshot extension, limitations, and future
calibration needs (below).

## Known weaknesses

- **No real calibration** — every threshold/allowance in
  `durationModelV0Config` is a documented V0 starting point, not a
  validated constant.
- **No genuine alternate-itinerary computation** after a missed
  connection/cancellation — `"route-disrupted"` with wide uncertainty is
  honest but not actionable; a rider still doesn't know their actual next
  option. Would require a live GTFS-querying capability, deliberately
  deferred.
- **Car duration has no finer-than-whole-route granularity** — same
  limitation as the risk model, inherited from `buildCommuteFeatures`
  (Google's traffic-aware response has no per-segment breakdown in the
  current domain model).
- **Heuristic weather/road-event widenings are hand-picked, not derived**
  from any observed relationship between conditions and actual delay.

## Data needed for calibration

The same conceptual dataset the risk model's ADR describes
(`docs/decisions/0009-v0-hardening-and-evaluation-design.md`) — feature
snapshots paired with real observed outcomes — but for duration
specifically: actual arrival times, so the heuristic uncertainty widths
can eventually be checked against how often the true duration actually
fell inside the predicted range (rather than assumed reasonable).

## Consequences

- `docs/architecture.md` gained a full "Expected commute duration model
  (V0)" section; "Explicitly deferred" was updated.
- `lib/evaluation/types.ts`'s `PredictionSnapshot` gained the optional
  `durationPrediction` field, verified non-breaking for pre-existing
  snapshots.
- Next stage's natural scope, per the project brief's own sequencing, is
  recommended departure (which needs expected-duration behavior validated
  first, exactly what this stage produced) — still explicitly not built
  yet, pending approval.
- Verified with the full test suite (655 tests passing, including 24
  duration scenario-matrix cases, transit-timeline propagation tests for
  every required case — no transfer, bus→rail transfer, delayed-but-
  survivable, delayed-and-missed, canceled first/second leg,
  schedule-only, missing realtime — counterfactual tests, range-invariant
  tests, and evaluation-snapshot backward-compatibility tests), `next
  lint`, `tsc --noEmit`, `next build`, and a live testing run against
  real weather/traffic/transit APIs covering SFU→Surrey (car and
  transit), Vancouver→Burnaby (car), a walking trip, a cycling trip,
  near-current/tomorrow/near-72h horizons, and an identical route at
  6am vs. 8am (confirming the model reflects real, un-tuned traffic
  differences) — see the conversation's final report for full results.
