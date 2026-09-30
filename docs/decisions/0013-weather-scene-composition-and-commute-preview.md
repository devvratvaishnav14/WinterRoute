# 0013 — Weather scene composition + Preview My Commute

**Date:** 2026-09-29

## Context

Two independent, presentation-only additions in one stage: (1) making
the weather background scene visually correct/convincing (deterministic
sun/moon visibility, materially stronger clouds, and genuine "dry
thunderstorm" support), and (2) WinterRoute's signature interactive
feature, "Preview my commute" — a compressed animation of a marker
moving along the route's own already-computed geometry. Full mechanism
detail lives in `docs/architecture.md`; this records the decisions and
why the alternatives were rejected. No `lib/scoring/`, `lib/timing/`,
`lib/duration/`, `lib/route/computeRoute.ts`, weather/traffic/transit
provider, or Maps API request logic changed — confirmed by the diff
touching only `lib/weatherScene/`, `lib/preview/`, `lib/conditions/`
(existing presentation-only sub-domain), and `components/`.

## Decisions

- **Extend `WeatherSceneDescriptor` with `sky`/`lightning`, rather than
  replace it.** The existing descriptor already covered most of the
  requested compositional axes (`intensity`, `precipitationType`,
  `cloudiness`, `windLevel`, `dayPhase`, `dataStatus`) and is consumed
  by `weatherHeadline.ts`'s sky-condition text and `buildRouteConditions.ts`.
  Adding two new fields (`sky`: a proper 5-value clear/mainly-clear/
  partly-cloudy/overcast/foggy axis; `lightning`: an explicit boolean,
  decoupled from `condition === "thunderstorm"`) got the full requested
  composition with zero breaking changes to either existing consumer,
  instead of a parallel `WeatherVisualScene` type that would need its
  own derivation-from-analysis logic duplicating `resolveWeatherScene`'s
  model-agreement/alert-escalation rules.
- **Dry thunderstorm required fixing `precipitationTypeFor`, not just
  adding a field.** Previously `precipitationTypeFor("thunderstorm")`
  was hardcoded to `"rain"` — a real (if minor) bug once "dry
  thunderstorm" became a requirement, since it meant every thunderstorm
  showed rain particles regardless of measured precipitation. Fixed to
  derive from the actual measured `maxPrecipitationMm`/`maxSnowfallCm`,
  same as every other condition. `condition` itself still resolves to
  `"thunderstorm"` for both wet and dry cases (the sky-gradient "mood"
  is identical); only `precipitationType` (which now drives particle
  rendering) and the new `lightning` field differ.
- **Sun/moon visibility is a pure function of `sky`+`dayPhase` alone.**
  Because `sky` already resolves to `"overcast"` for every
  precipitating/stormy condition (this app never renders a sun-shower),
  `sunVisibility.ts`'s truth table doesn't need to separately check
  precipitation or lightning — one deterministic function
  (`isSunVisible`/`isMoonVisible`) is the single source of truth for
  whether an actual sun/moon disc renders, consumed identically by the
  background scene and (indirectly, via the same `sky`/`lightning`
  inputs) the weather icon.
- **Cloud layers got stronger opacity AND a two-tone (highlight+shadow)
  shape, not just more layers.** The original complaint was
  specifically that clouds read as "faint transparent blobs." Simply
  adding more layers at the same low alpha would have made the problem
  worse (more faint blobs), not better. Each cloud mass is now built
  from a darker "shadow" radial-gradient stack UNDER a brighter
  "highlight" stack — a cheap way to fake a lit volume with pure CSS
  gradients — at meaningfully higher alpha (verified directly by
  `skyLayers.test.ts`'s `maxAlpha` assertions), with overcast/rain/snow/
  storm getting 3 depth layers (far/mid/near) and partly-cloudy getting
  2 (up from 1, so it visibly reads as "partly cloudy" and so a cloud
  layer can drift across the sun's position).
- **The Weather Scene Lab's `DevSceneOverride` carries the FULL
  compositional tuple, not just condition+dayPhase.** Several named
  presets need an intensity/precipitation combination a real forecast
  would never independently produce from `condition` alone — e.g.
  "Thunderstorm + Light Rain" needs `intensity: "light"` where a real
  thunderstorm always derives `"heavy"`. Carrying the full tuple in the
  override (and applying all of it in `applyDevSceneOverride`) was
  simpler and more honest than trying to reverse-engineer a fake
  `RouteWeatherAnalysis` that would produce the desired combination
  through the real resolver.
- **Preview My Commute never issues a second routing/geometry request.**
  `lib/preview/` builds entirely on `RouteSegment.geometry` (already
  fetched once by the original route computation) — `segmentGeometryPoints`
  falls back to a straight `[start, end]` line exactly like
  `routeMapGeometry.ts`'s `segmentPath`, kept as an independent, small,
  framework-agnostic function rather than importing that Google-Maps-
  shaped one, since `lib/preview/` must stay provider/DOM-independent
  and unit-testable without any Google Maps types in scope.
- **Preview timing is proportional-with-a-floor-then-rescaled, not a
  fixed per-segment duration.** A segment's compressed share starts
  proportional to its real duration (falling back to distance, then
  equal share), is floored at a minimum so tiny transfers stay visible,
  and the WHOLE schedule is then rescaled into a fixed
  `[6000ms, 15000ms]` total. The floor is a SOFT floor — for a route
  with many tiny segments, rescaling can compress it slightly further —
  a deliberate trade-off documented in `timing.ts` rather than silently
  present: the hard cap on total preview length always wins, so a
  90-minute real commute never takes a full minute to preview.
- **The moving marker is positioned via an imperative
  `RouteMapPreviewHandle`, never React state per frame.** `RouteMap`
  exposes `setPreviewMarker(position, mode)` through a
  `MutableRefObject` populated once the map is ready; the preview's
  animation loop (`usePreviewPlayback`) calls it directly from a
  `requestAnimationFrame` loop. React state (`activeSegmentId`,
  `status`, `announcement`) only changes at meaningful transitions —
  never every frame — per the explicit performance requirement.
- **The animation loop is a ref-stored plain function, not a
  self-recursing `useCallback`.** A `useCallback` that closes over
  props/state directly and calls itself recursively
  (`clock.requestFrame(tick)` from inside `tick`'s own body) is flagged
  by this project's `eslint-plugin-react-hooks` ruleset as an unsafe
  self-referencing pattern (stale-closure risk if the callback's
  identity ever changes while a loop is in flight). `tick` is instead
  assigned once, inside a `useEffect` with an empty dependency array, to
  a ref (`tickFnRef`); it reads route/schedule/clock through OTHER refs
  kept in sync every render via their own effect. This mirrors
  `WeatherParticles.tsx`'s existing rAF loop (a plain function declared
  inside `useEffect`), extended with the extra indirection a *reusable
  hook* (rather than a one-off effect) needs to remain safely callable
  from `start()`/`resume()`.
- **An injectable `PreviewClock` makes the whole state machine
  unit-testable without real timers.** `now()`/`requestFrame()`/
  `cancelFrame()` default to `performance.now()`/`requestAnimationFrame()`/
  `cancelAnimationFrame()`, but `usePreviewPlayback` accepts an override —
  tests pass a fully manual, synchronously-advanced fake clock instead
  of relying on `vi.useFakeTimers()`'s rAF interception (which the
  codebase had no existing precedent for) or real async timing (flaky).
- **Reduced motion holds at each segment's midpoint rather than running
  a second, parallel stepped-preview implementation.** The SAME
  schedule/timing/highlight/announcement machinery runs; only the
  per-frame POSITION calculation changes (snapped to the active
  segment's midpoint instead of continuously interpolated), so the
  marker visibly holds still within a segment and only moves at segment
  boundaries — satisfying "no continuous marker movement" with far less
  code than a fully separate reduced-motion code path.
- **Manual segment selection is disabled during playback, not
  reconciled with it.** Clicking a map segment or itinerary step while
  the preview is playing/paused does nothing (`onSelectSegment`/
  `onSelectStep` become `undefined`), rather than trying to make manual
  clicks "jump" the preview to that segment. Per the spec's own
  "choose the simpler robust behavior" — reconciling two independent
  sources of "what's currently active" (user clicks vs. playback
  position) would add real state-machine complexity for a rarely-used
  interaction during a ~10-15 second animation.
