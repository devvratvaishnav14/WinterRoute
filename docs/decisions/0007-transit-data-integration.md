# 0007 — Transit data integration: TransLink GTFS static + GTFS-Realtime V3

**Date:** 2026-09-26

## Context

WinterRoute's transit stage: enrich the real `bus`/`rail` segments of a
Google-computed route with TransLink's own scheduled and (where
published) realtime data — the last factual data layer before
feature-engineering/scoring begins. Still no commute-risk score, no
transit-delay prediction, no crowding prediction, no missed-transfer
probability, no map. Deep rationale lives in `architecture.md` ("Transit
data pipeline") and `data-sources.md`; this records the decisions and one
significant bug found only by live testing.

## Decisions

- **GTFS-Realtime V3, not the retired RTTI API** — confirmed live before
  writing any code against it (all three V3 endpoints returned real
  protobuf `200` responses).
- **`gtfs-realtime-bindings` for decoding, `jszip` for the static ZIP** —
  both real, maintained libraries; no hand-written protobuf/ZIP parsing.
- **Eager index for small GTFS tables, lazy scan for `stop_times.txt`.**
  TransLink's real `stop_times.txt` is 1.84M rows / 91MB uncompressed —
  persistently parsing and indexing all of it was rejected as impractical
  memory overhead. `GtfsStaticStore` eagerly indexes `routes`/`trips`/
  `stops`/`calendar`/`calendar_dates` (all comfortably small) and keeps
  `stop_times.txt` as cached raw text, scanned once per analysis for
  exactly the candidate trip IDs already narrowed down by route/service/
  time — see `architecture.md`.
- **Multi-signal matching with an explicit `TransitMatchQuality`**
  (`exact`/`high-confidence`/`ambiguous`/`unmatched`), never a silent
  guess among genuinely ambiguous candidates. Signals: route identifier
  (short name, with a long-name fallback — see the bug below), stop
  proximity + ordering, and scheduled-time closeness.
- **GTFS calendar/time handling built as small, independently-tested
  primitives** (`lib/transit/gtfsTime.ts`, `lib/transit/gtfsStatic/
  calendar.ts`) before matching was written on top of them —
  `calendar.txt` + `calendar_dates.txt` combination, `>24:00:00` time
  rollover (verified to work "for free" via `Date.UTC`'s natural
  hour-rollover), and DST-safe Vancouver local time (shared with
  DriveBC's identical problem from the traffic stage, moved to
  `lib/time/vancouverTime.ts`).
- **"No update ≠ on time" made structural.** `TransitSegmentAnalysis.realtime`
  is `undefined` — not a zero-delay object — whenever TransLink hasn't
  published a Trip Update for the matched trip. Architecturally
  impossible to render as "on time" by omission.
- **Recency is evidence (a real Trip Update exists for this trip), not an
  assumed time cutoff.** The project brief explicitly warned against a
  fixed "realtime applies within N hours" rule; live testing confirmed
  why — TransLink's realtime coverage tracks vehicles actually in
  service, not every future scheduled trip (see "Bug found" below for the
  related discovery, and `data-sources.md` for the direct evidence).
- **Vehicle Positions only ever attached to a realtime-confirmed
  (near-term) segment**, with a 5-minute staleness threshold matching the
  realtime feed's own cache TTL. A position with no timestamp is treated
  as unusable, never assumed fresh.
- **No occupancy/crowding UI** — confirmed live, twice (an initial
  `!= null` check gave a false positive; `hasOwnProperty` +
  `toObject({ defaults: false })` confirmed the real 0/805 absence), that
  TransLink's feed doesn't publish it.
- **Alerts matched conservatively via `informedEntity`**, most-specific
  field first (trip → stop → route → system-wide), requiring active-period
  overlap with the segment's own commute time — a future alert legitimately
  applies to a future trip if its period covers it. System-wide alerts go
  into `TransitAnalysis.systemAlerts`, never attached to individual
  segments.
- **5-minute realtime cache TTL, 12-hour GTFS static TTL**, sized against
  the confirmed 1,000-requests/day quota (worst case 864/day across the
  three realtime feeds) — see `architecture.md`.
- **Non-transit requests never call TransLink at all** — checked before
  any fetch, static or realtime (verified live: Car/Walk requests
  returned in ~2ms vs. 900ms–7s for a real transit analysis).

## Bug found only by live testing (one, significant)

**SkyTrain/rail routes have no `route_short_name` in TransLink's real
GTFS feed.** The initial matching implementation used `route_short_name`
as the only route identifier — correct for every bus route tested, but
the Expo Line's `route_short_name` turned out to be an empty string live,
which meant **every rail segment was permanently `unmatched`** by
construction. This directly undermined the explicit requirement to
analyze a route's real Bus+SkyTrain segments, not just its bus segments.
Caught by testing the actual SFU Burnaby → Surrey Central route (a real
Bus → SkyTrain → Bus → Bus itinerary) end-to-end rather than only with
synthetic bus-only fixtures. Fixed by adding a `route_long_name` fallback
(`GtfsStaticStore.findRoutesByLongName`) used exactly when a segment has
no short name — confirmed live that Google's `transitLine.longName`
("Expo Line") matches GTFS `route_long_name` exactly. Re-verified live
after the fix: all four segments of the real mixed route (Bus 145 →
Expo Line → Bus 555 → Bus 337) matched `exact`.

This is recorded because none of the synthetic unit-test fixtures written
before this point happened to include a route with an empty short name —
a good reminder that a fixture matching the *shape* of real data isn't
the same as a fixture matching a real edge case that live data actually
has.

## Verified live, not just unit-tested

- **SFU Burnaby → Surrey Central Station, Bus mode, ~40 min out:** a real
  4-segment transit itinerary (Bus 145 → Expo Line → Bus 555 → Bus 337),
  all four matched `exact` after the long-name fix, all
  `matched-schedule-only` (no realtime yet published this far out).
- **Mixed bus + SkyTrain analyzed correctly**, including the rail segment,
  confirming the "analyze whatever segments the real route has" 
  requirement.
- **Near-term (~15 min out), leave-now, tomorrow (+20h), and near-72h
  (+71h) departures** all computed and analyzed correctly, including
  correct calendar-date handling across the +71h boundary.
- **Pure Car and pure Walk routes** both returned `not-applicable` in
  ~2ms — confirmed (by code path and by the timing itself) that no
  TransLink request was made for either.
- **A real Google-vs-GTFS-Static-vs-GTFS-Realtime comparison** (Bus 145,
  SFU → Production Way–University): Google's segment time and the GTFS
  static schedule agreed exactly; GTFS-Realtime had no Trip Update for
  that specific trip at all — confirmed by hand-decoding the live feed
  and searching for the trip ID directly, not assumed. No agreement was
  manufactured; see `data-sources.md` for the full finding.
- **Partial-failure behavior** verified live (all four sources returned
  `"ok"` in every real run performed) and via a mocked
  trip-updates-failure test (analysis still completes on schedule data
  alone).

## Consequences

- `docs/architecture.md` gained a full "Transit data pipeline" section
  and updated its "Explicitly deferred" / "Open questions" sections to
  reflect that TransLink data is now a completed factual layer, not an
  unstarted one; `docs/data-sources.md` gained a TransLink section plus
  an attribution-block addition using TransLink's exact required wording.
- Next stage's natural scope is feature engineering / scoring — a
  commute-risk score built on top of the now-complete weather, traffic,
  and transit factual layers — per the project brief's explicit
  sequencing.
- Verified with the full test suite (335 tests passing, including
  synthetic-fixture coverage for GTFS static parsing, calendar
  combination logic, route/trip matching — exact/ambiguous/unmatched/
  wrong-direction/prior-service-day cases — GTFS-Realtime transformation,
  vehicle position freshness, alert scope/active-period matching, and
  orchestration-level partial-failure/no-unnecessary-fetch behavior),
  `next lint`, `tsc --noEmit`, `next build`, and extensive real-API
  testing against the live TransLink and Google APIs — see the
  conversation's final report for the full log.
