# 0012 — Route map + weather scene (V1 visualization)

**Date:** 2026-09-28

## Context

The first major visual stage: a real Google Maps visualization of the
already-computed `Route`, and a dynamic, atmospheric background driven
by the selected commute's `RouteWeatherAnalysis`. Explicitly
presentation-only — no scoring/duration/timing/routing/traffic/transit
calculation logic changed. Full mechanism detail lives in
`docs/architecture.md` "Map visualization architecture" and "Weather
scene architecture"; this records the decisions and the two real
limitations found while building it.

## Decisions

- **Two separate Google API keys, two separate trust boundaries.**
  `GOOGLE_MAPS_API_KEY` (server-only, used by `lib/google/*` for
  Places/Routes) and `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (public,
  used only by `components/map/googleMapsLoader.ts` for Maps
  JavaScript) are never read from the same code path. Verified directly
  against the production build output: the server key does not appear
  in any `.next/static/**/*.js` chunk; the browser key does.
- **`google.maps.importLibrary`, loaded once, written out longhand.**
  Uses the current documented "dynamic library import" approach — a
  base `<script>` that exposes `google.maps.importLibrary`, with
  individual libraries (`"maps"`, `"marker"`, `"core"`) fetched on
  demand. Rather than pasting Google's official minified bootstrap
  snippet (which lets `importLibrary` be called before any script
  exists at all), `googleMapsLoader.ts` writes an equivalent, readable,
  type-safe loader: inject the script at most once (a cached
  module-level promise, shared across every `RouteMap` mount —
  including React 19 dev-mode's double-invoked effects), resolve once
  it loads, then let callers `await google.maps.importLibrary(...)`
  directly. Behavior is equivalent; only the minification is removed.
- **No new browser routing request.** `RouteMap` renders
  `RouteSegment.geometry` (already computed server-side by the ORIGINAL
  `computeRoute` call, unchanged from the routing stage) — never a new
  Directions/Routes call from the browser. Confirmed by
  `routeMapGeometry.test.ts` operating purely on `Route` objects with no
  network dependency.
- **Traffic-interval coloring is NOT implemented — the data doesn't
  support it.** `TrafficInterval.startPolylineIndex`/`endPolylineIndex`
  index into the traffic-aware request's OWN polyline
  (`googleResult.polyline` in `lib/traffic/transform.ts`), which is used
  transiently to compute `distanceMeters` and then discarded — it is
  never preserved on `TrafficAnalysis`. That polyline also comes from a
  SEPARATE Google Routes request (`TRAFFIC_AWARE_OPTIMAL`, queried at
  the actual commute time) than `RouteSegment.geometry` (the original
  route computation), so even reconstructing it would not be guaranteed
  to align point-for-point with the geometry the map actually draws —
  Google's traffic-aware alternative can differ from the baseline route.
  Per the explicit "do not fake traffic location" instruction: drive
  segments render in one consistent WinterRoute color; the real
  NORMAL/SLOW/TRAFFIC_JAM proportions stay exactly where they already
  lived, in `ConditionsSummary`'s traffic card
  (`computeConditionBreakdown`). This is a real, documented data-model
  gap, not a decision that could be revisited by trying harder in the
  map layer alone — closing it would need `TrafficAnalysis` to start
  preserving its own polyline, a traffic-pipeline change out of scope
  for a presentation-only stage.
- **Transit stops omitted in V1.** Per the explicit "if it becomes
  visually noisy, omit it" instruction — only origin/destination
  markers and mode-styled segment polylines are drawn. No
  major-transfer-point markers yet.
- **Weather scene resolver reads `RouteWeatherAnalysis` directly, not
  `lib/scoring/`'s `CommuteFeatureSet`.** `RouteWeatherFeatures` (already
  computed and preserved on `ExperimentalCommuteRiskV0.features.weather`)
  has the right AGGREGATES (max precipitation/snowfall, agreement
  ratios) but requires the risk model to have succeeded, and lacks the
  per-forecast `weatherCode` the scene needs for its condition bucket in
  the first place. `resolveWeatherScene` takes `RouteWeatherAnalysis`
  alone so the scene never depends on risk-model success, and derives
  its own small, presentation-only max/agreement aggregates directly —
  a deliberate, minor duplication of `lib/scoring/weatherFeatures.ts`'s
  technique, accepted so the weather-visualization layer has no
  dependency on the risk-scoring layer at all.
- **Multi-model consensus: one vote per model, majority wins, minority
  precipitation never dominates.** For each independent model
  (`source.modelId`), take that model's own WORST-CASE condition
  anywhere on the route (so one model's route-long story is one vote,
  regardless of how many sample points it appears at); tally votes;
  a majority (>=50%) wins outright. On disagreement with no majority:
  if every vote is sky-only (clear/partly-cloudy/cloudy), pick the
  ordinal middle as a defensible consensus; otherwise fall back to the
  cloudiest sky-only vote present, explicitly NOT the minority
  precipitation signal. A vote for a precipitation bucket is additionally
  discarded (demoted to cloudy) if no model actually reported measurable
  precipitation/snowfall to back it up. Verified directly against every
  disagreement example in the brief (clear+partly-cloudy+overcast ->
  partly-cloudy; 1 drizzle + 2 clear -> clear; 2 snow + 1 rain -> snow).
- **Official alerts can only intensify an already-supported condition,
  never invent one.** A snow-related alert only escalates to
  `heavy-snow` when the resolved condition is already snow or
  measurable snowfall exists; same for rain. `alertStatus === "unavailable"`
  is recorded in `derivationNotes` and never treated as "confirmed no
  alert."
- **Day/night: a real solar-elevation calculation, not the provider's
  `is_day` field.** Open-Meteo does expose an `is_day` variable on some
  products, but adding it would mean deciding which of the three
  independent named models' `is_day` to trust (an ensemble question the
  brief explicitly warns against solving with "arbitrary weights") for a
  value that is pure astronomy, not a model disagreement at all. Instead
  `lib/weatherScene/dayPhase.ts` computes solar elevation directly from
  the route origin's latitude/longitude and the selected commute
  `Date` (declination + equation-of-time + hour angle, the standard
  approximation), using `-0.833°` as the conventional sunrise/sunset
  threshold. No hardcoded UTC offset, no timezone database — DST is
  handled for free because everything is computed from real UTC
  instants and longitude. This required no change to
  `lib/weather/providers/openMeteo.ts` or any normalized weather type.
- **Dev-only scene switcher via an external store, not prop drilling.**
  `lib/weatherScene/devSceneOverride.ts` uses the same
  `useSyncExternalStore` module-level-state pattern already established
  by `lib/storage/recentTrips.ts`, rather than threading an override
  prop through `TripForm` -> `ResultsView` -> `DetailsDrawer` and back
  down into `WeatherSceneBackground`. `applyDevSceneOverride` is a pure,
  non-mutating function called only from `WeatherSceneBackground`, gated
  by `process.env.NODE_ENV === "development"` at the call site — it has
  no path to any risk/duration/timing/weather-analysis code.
- **Crossfade via render-time state adjustment, not an effect.** The
  scene-change crossfade (`WeatherSceneBackground.tsx`) adds a new
  layer during RENDER (React's documented "adjusting state when a prop
  changes" pattern) rather than in a `useEffect` body, avoiding a
  same-tick extra render and satisfying `react-hooks/set-state-in-effect`
  without changing the actual crossfade behavior. The old layer's
  removal (a real timer) stays in a `useEffect`.
- **Particle system stays off the main thread's critical path and off
  non-precipitating scenes entirely.** `WeatherParticles` never mounts a
  `<canvas>` for clear/partly-cloudy/cloudy/fog — only rain-family/
  snow-family/storm conditions get one. Particle count is capped at 140
  regardless of intensity; stepping is delta-time based (frame-rate
  independent, tested directly); the animation pauses on
  `visibilitychange` and tears down its `requestAnimationFrame`/
  `ResizeObserver` on unmount or condition change.
