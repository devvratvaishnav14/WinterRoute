# 0006 — Traffic data pipeline: Google traffic-aware routing + DriveBC road events

**Date:** 2026-09-24

## Context

WinterRoute's traffic stage: a factual traffic-aware analysis for driving
trips (compared against the existing baseline, never replacing it), plus
official DriveBC road events matched to the route's real geometry and
timing. Still no commute-risk score, no weather+traffic combination, no
recommended departure. Deep rationale lives in `architecture.md` ("Traffic
data pipeline") and `data-sources.md`; this records the decisions and,
notably, three related real bugs found only by testing the actual
pipeline in a browser — each masked by the others until fixed one at a
time.

## Decisions

- **`TRAFFIC_AWARE_OPTIMAL`, not `TRAFFIC_AWARE`.** Confirmed against
  Google's current docs: `TRAFFIC_AWARE` trades accuracy for reduced
  latency; `TRAFFIC_AWARE_OPTIMAL` doesn't. Since this runs once per
  explicit "Check my commute" submission, accuracy was the right
  trade to make.
- **`TrafficModel: BEST_GUESS`**, confirmed to require
  `TRAFFIC_AWARE_OPTIMAL` specifically (further validating that choice).
  `PESSIMISTIC`/`OPTIMISTIC` exist in Google's API but weren't used — the
  brief is explicit that a single defensible best-estimate, not a
  worst-case framed as the prediction, is what this stage needs.
- **`TRAFFIC_ON_POLYLINE` implemented**, accepting its higher "Routes
  Preferred" billing tier — a deliberate, documented cost decision, kept
  in check by the same discipline as everything else Google-related:
  once per explicit user action, never per keystroke/render.
- **Baseline and traffic-aware routing are two separate requests and two
  separate fields**, never merged. `TrafficAnalysis` keeps
  `referenceBaselineDurationMinutes` (WinterRoute's own baseline) and
  `googleStaticDurationMinutes` (Google's `staticDuration` for *this*
  traffic-aware request) as distinct fields on principle, even though
  they were equal (28min = 28min) in the live SFU→Surrey test — not
  assumed identical just because they usually are.
- **Traffic-aware analysis only ever reaches `"analyzed"` for Car.** Bus
  does not inherit the car traffic-delay figure — real road congestion
  matters for buses, but presenting an unmeasured number as measured
  would be dishonest. Road events, by contrast, are checked for every
  mode, since a real closure is real regardless of how someone travels
  past it.
- **Distance-weighted traffic-condition percentages**, not a point-count
  approximation. The traffic-aware response's own polyline is decoded
  specifically for this purpose (not assumed identical to the baseline
  route's polyline) and real haversine distances are summed per interval
  — chosen specifically because the brief cautioned against fabricating
  percentages from data that "cannot be reliably converted."
- **300m spatial threshold, schedule-based temporal filtering** for
  DriveBC events, both pure/tested. An event with unknown timing is kept
  (flagged `"unknown"`), not excluded — excluding it would claim
  certainty WinterRoute doesn't have. Direction is preserved as metadata,
  never used to filter, since reliably computing the route's own
  directionality at a matched point wasn't attempted this stage.
- **DST-safe Vancouver local-time parsing** for DriveBC's
  `schedule.intervals` (confirmed to lack a UTC offset, unlike
  `created`/`updated`), using the same double-conversion technique
  established for other timezone-sensitive parsing in this project —
  verified against both a summer and winter date.
- **Process-local in-memory cache with in-flight deduplication**
  (`lib/traffic/requestCache.ts`), not a database. 2-minute TTL for
  Google traffic (near-term-sensitive per the brief), 5 minutes for
  DriveBC events. Documented as a real limitation (no cross-restart or
  multi-instance freshness guarantee), not silently glossed over.

## Bugs found only by testing the real pipeline (three, compounding)

These are recorded in detail because they're a good interview story about
what unit tests alone don't catch, and because each one masked the next:

1. **The UI never showed the actual failure reason.** `TrafficPreview`
   hardcoded a generic "Traffic data is currently unavailable for this
   trip" for every `"unavailable"` status, regardless of what
   `analyzeRouteTraffic` actually returned. Passed every unit test (which
   checked the orchestration's return value directly, not what the
   component renders) and only surfaced by looking at the real rendered
   page.
2. **Once fixed, the real reason revealed a second, genuine bug**: a
   non-transit "Arrive by" trip near the default (unmodified) date/time
   produced a nominal departure already in the past
   (`nominalDeparture = arrival − baselineDuration`, and `arrival ≈ now`)
   — Google correctly rejected it ("Timestamp must be set to a future
   time"). Fixed by detecting this before attempting the call, with a
   specific honest reason.
3. **The fix for #2 introduced a third bug**: the past-check compared a
   minute-precision selected time against a full-precision "now" using
   `<=` instead of `<`, so a value exactly equal to the current minute
   (a completely valid, untouched "Leave at now" selection) was wrongly
   rejected — the *exact* bug class already fixed once before for
   trip-form validation (stage 0002), reintroduced here by not applying
   the same floor-before-compare discipline. Caught by a regression test
   modeled directly on that earlier fix.
4. **Even after floor-correcting the check, the live browser test still
   failed** — with the *original* Google error, not the new one. Sending
   our own server's `analyzedAt` as `departureTime` still wasn't
   "future" enough by the time the request reached Google — network
   latency plus any clock skew between servers. Fixed with a 15-second
   forward safety buffer, applied only when needed, verified live.

None of these four were caught by `tsc`, `eslint`, or the unit test suite
as it stood before each fix — only by actually submitting a trip in a
browser and reading what appeared. This is the same lesson as prior
stages' bugs, compounded: a plausible-looking fix needs to be re-verified
live, not assumed correct because it addressed the symptom that was
visible at the time.

## Verified live, not just unit-tested

- **The comparison test** (same SFU Burnaby → Surrey Central route, two
  different real departure times): 5am returned a traffic-aware duration
  of 24min against a 28min static duration (delay clamped to 0, correctly
  — traffic-aware was genuinely *faster*); an 8am weekday departure on
  the identical route returned 30min (+2min delay). Confirms WinterRoute
  is genuinely querying the selected time, not returning a cached/current
  result for every request.
- **Non-driving modes never show a fabricated number**: Bus, Walk both
  returned `"not-applicable"` with an honest, mode-specific reason; road
  events were still checked correctly for both.
- **A real DriveBC construction event** was found, correctly matched to
  the route by real geometry, and correctly time-matched (a recurring
  9pm–5am closure, confirmed to overlap the analyzed commute time).
- **A full successful traffic analysis rendered correctly end-to-end**
  after the four fixes above: baseline/reference, Google traffic-aware
  duration, delay, and a real distance-weighted condition breakdown
  (e.g. "Normal: 85% · Slow: 4% · Traffic jam: 10%") — desktop and
  mobile, no horizontal overflow, no console errors.

## Consequences

- `docs/architecture.md` gained a full "Traffic data pipeline" section;
  `docs/data-sources.md` gained Google traffic-aware and DriveBC/Open511
  sections plus an updated attribution block.
- Next stage's natural scope is TransLink live-transit data (the
  remaining explicitly-flagged data layer) or beginning the
  feature-engineering/scoring layer now that location, routing, weather,
  and traffic foundations all exist and are tested.
- Verified with `npm test` (224 tests passing, including provider-failure
  mocks and the minute-flooring regression test for the traffic
  orchestration layer), `next lint`, `tsc --noEmit`, `next build`, and
  extensive real-API browser/API testing — see the conversation's final
  report for the full log.
