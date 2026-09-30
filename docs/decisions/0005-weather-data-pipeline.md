# 0005 — Weather data pipeline: multi-model forecasts + official alerts

**Date:** 2026-09-24

## Context

WinterRoute's first weather stage: sample a computed route in space and
time, fetch three independent numerical weather models plus official ECCC
alerts, and produce a factual weather preview — no risk score, no
confidence percentage, no traffic. Deep rationale lives in
`architecture.md` ("Weather data pipeline") and `data-sources.md`; this
records the decisions and what was learned building them.

## Decisions

- **Open-Meteo as the structured access layer**, requesting three named
  models directly (`cmc_gem_hrdps`/`cmc_gem_rdps` as one "Canadian" slot
  with automatic horizon fallback, `ecmwf_ifs025`, `ncep_gfs013`) rather
  than its auto-blended "best match" — the whole point is knowing which
  model said what. Model identifiers were verified against the live API
  (an invalid one is rejected with 400), not copied from documentation
  alone — see `data-sources.md` for the ones ruled out this way.
- **ECCC's GeoMet-OGC-API directly for official alerts**, not through
  Open-Meteo — a government warning shouldn't be laundered through a
  forecast aggregator. The `weather-alerts` collection name and its exact
  schema were both discovered against the live API, not guessed.
- **Each model's forecast is preserved separately** in
  `RouteWeatherSample.forecasts` — never pre-averaged. `ensemble` is a
  derived, transparent descriptive summary computed alongside it, not a
  replacement. This is a data-science requirement (future model
  evaluation needs to know which model said what), not a UI choice.
- **No model weighting and no confidence percentage.** Both would need
  empirical validation that doesn't exist yet. `WeatherEnsembleSummary`
  reports only facts ("3/3 models predict precipitation," a min/max
  range) — seeing this as a gap would be a misreading; it's a deliberate,
  principled omission (see `architecture.md` "Model agreement vs.
  calibrated confidence").
- **Route geometry was added this stage**, not carried over from the
  previous one. Checking back, the routing stage (0004) deliberately
  didn't request Google's polyline data — accurate spatial sampling
  turned out to need it, so `routes.legs.steps.polyline.encodedPolyline`
  is now requested and decoded (`lib/google/polyline.ts`, verified
  against Google's own reference example) into `RouteSegment.geometry`.
- **`deriveSegmentTimes` moved from `lib/google/transform.ts` to
  `lib/route/timeline.ts`.** It was always generic route-segment-timing
  logic that happened to live in the Google module; weather's nominal
  Arrive-By baseline needed to reuse it without a Google dependency, which
  is what prompted noticing and fixing the original placement.
- **Nominal baseline timeline for non-transit "Arrive by"**, computed and
  named explicitly (`arrival time - baseline duration`,
  `usedNominalBaselineTimeline: true`) so it can never be mistaken for a
  recommended departure — surfaced to the user as a visible note, not
  silently used.
- **HRDPS/RDPS fallback is per sample point, not per trip.** A single
  route's later samples can use RDPS while earlier ones on the same trip
  use HRDPS, determined by whether Open-Meteo actually returned non-null
  data at that point/time — never a hardcoded "switch after 48 hours"
  cutoff, confirmed by testing a 70-hour-out trip live and observing the
  Canadian slot correctly falling back to RDPS.
- **Sampling always keeps every segment boundary**, spending remaining
  budget (target 7, cap 10) on intermediate points along segments over
  3km, placed on the segment's real geometry via distance-weighted
  interpolation (not straight lines, not evenly-spaced-by-index).
- **No caching layer this stage.** Each trip check makes fresh provider
  requests. Deferred deliberately (see `architecture.md`), not an
  oversight — every value carries the freshness metadata
  (`retrievedAt`/`analyzedAt`) a future cache or evaluation pipeline will
  need regardless.

## Verified live, not just unit-tested

- **Elevation-driven spatial variation is real**, not city-wide: the
  SFU Burnaby → Surrey Central route showed 332m at SFU descending to 3m
  near the Fraser lowlands, each sample point carrying its own real
  elevation and temperature — directly answering the "is this actually
  per-location or one value applied everywhere" sanity check.
- **Genuine model disagreement is preserved**: a real Surrey Central
  sample showed HRDPS 14.9°C, ECMWF 15.4°C, GFS 11.7°C with GFS alone
  predicting light drizzle — exactly the kind of divergence averaging
  would have destroyed.
- **HRDPS → RDPS fallback confirmed at both ends**: a trip 3 hours out
  used HRDPS; the identical route 70 hours out correctly used RDPS
  instead, with all other models unaffected.
- **Multi-segment (9-segment transit) sampling hit the 10-point cap
  exactly**, using every real segment boundary with no room for
  intermediates — correct behavior for an already-detailed route.

## Bugs and gaps found only by testing the real pipeline

- **A test artifact, not a product bug, initially looked like one**:
  passing a route object computed for one departure time alongside a
  *different* trip time to the weather endpoint reused the route's own
  stale segment times (correct behavior — a route's real times should be
  trusted when present) — this only manifested as a mismatch because the
  test itself passed inconsistent inputs, which the real app's call
  sequence can't produce. Documented in case a future refactor
  decouples the calls in an order the app doesn't yet consider.
- **`TRAFFIC_UNAWARE` + timestamp rejection** (Google, not weather) was
  already recorded in ADR 0004 but is directly relevant here: it's what
  makes a `Route`'s segments untimed for `DRIVE`/`WALK`/`BICYCLE`
  "Arrive by," which is exactly the case the nominal baseline timeline
  exists to handle.

## Consequences

- `docs/architecture.md` gained a full "Weather data pipeline" section
  and `docs/data-sources.md` gained Open-Meteo and ECCC sections plus a
  shared attribution block.
- Next stage's natural scope is traffic (the project's other explicitly
  core-not-optional data layer per `overview.md`) or beginning the
  scoring/feature-engineering layer now that both routing and weather
  foundations exist.
- Verified with `npm test` (165 tests passing, including provider-failure
  mocks for the orchestration layer), `next lint`, `tsc --noEmit`,
  `next build`, and extensive real-API browser/API testing across trip
  horizons (near-now, tomorrow, 70 hours out), route types
  (single-segment drive, multi-segment transit, short walk), and the
  SFU elevation sanity check — see the conversation's final report for
  the full log.
