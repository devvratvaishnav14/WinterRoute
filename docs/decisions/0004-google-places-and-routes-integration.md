# 0004 — Google Places/Routes integration, recent history, overflow fix

**Date:** 2026-09-23

## Context

This stage was WinterRoute's first real external-data integration:
location autocomplete, place resolution, V1 service-area validation,
recent-location/trip history, and real baseline route computation —
still with no weather/traffic/risk logic. Deep technical rationale lives
in `architecture.md` ("Location & routing integration") and
`data-sources.md`; this records the decisions and what was learned
building them.

## Decisions

- **Google Places API (New) + Routes API**, chosen and integrated behind
  a provider/adapter layer (`lib/google/`) specifically so they can be
  swapped later without touching the rest of the app. See
  `data-sources.md` for the full rationale and discovered limitations.
- **Server-side-only API key**, enforced architecturally (no
  `NEXT_PUBLIC_` prefix, only imported by server modules) and verified
  empirically (grepped the production build output for the key value and
  the env var name — neither appears in the client bundle).
- **`TripRequest.origin`/`.destination` changed from unresolved
  `TripLocation` to real `ResolvedLocation`.** A trip can no longer be
  built from typed text — only from a verified Google Places selection.
  `TripLocation` as a formal type was removed (not deprecated/kept for
  compatibility) since nothing needed it once this changed; the "text
  someone is currently typing" concept is now just component-local
  `string` state, which is all it ever really was.
- **Selecting a place, then editing the text, invalidates the
  selection** — enforced in `LocationAutocomplete` and covered by a
  component test (the one behavior in this stage that genuinely needed
  `@testing-library/react` + `jsdom` + `@testing-library/user-event`
  rather than pure-function testing; added as dev dependencies for
  exactly that reason, not speculatively).
- **V1 service-area check runs once, at place resolution**, not per
  autocomplete keystroke. Enforced client-side only for now — see the
  documented limitation in `architecture.md`.
- **Recent locations/trips are localStorage-only**, versioned,
  namespaced, and defensively validated (corrupted data → `[]`, never a
  crash). Recent trips dedupe by origin+destination+mode, not time
  preference; reusing one never touches date/time or auto-submits.
- **Baseline route uses `staticDuration`, never `duration`.** Traffic
  awareness is a deliberately separate, not-yet-built concern.
- **Non-transit "Arrive by" does not produce a recommended departure
  time.** WinterRoute could trivially subtract a duration from a target
  arrival, but doing so here would blur "factual baseline" (this stage)
  with "recommendation" (an explicit future concept). The route preview
  simply omits it.
- **The route preview was replaced**, not just extended: the old
  "development preview, not a prediction" copy described captured *input*;
  the new "Route preview — prediction model not connected yet" describes
  a real *computed route* (typical duration, distance, mode sequence).
  Different enough in what it represents that reusing the old component
  name (`TripSummary`) would have been misleading — it's now
  `RoutePreview`.
- **Horizontal scrollbar root cause was `.atmosphere-bg::before`'s
  `inset: -20%`** (a deliberately oversized decorative layer for blur
  headroom), not something needing a blanket `overflow-x: hidden` on
  `html`/`body`. Fixed by scoping `overflow: hidden` to `.atmosphere-bg`
  itself — confirmed via `document.documentElement.scrollWidth` before
  (1536px vs. 1280px viewport — exactly the 20% offset) and after (equal)
  in a real browser, not just visual inspection.

## Bugs found only by testing the real integration (not by lint/types/build)

These are recorded because they're the kind of thing worth explaining in
an interview — each was a real defect that passed every automated
gate except actually exercising the code path:

1. **`TRAFFIC_UNAWARE` + any timestamp → Google 400.** *"Timestamp cannot
   be set for TRAFFIC_UNAWARE routing mode."* Found via a live
   `computeRoutes` call, not documented anywhere found beforehand. Fixed
   by never sending a timestamp for `DRIVE`.
2. **Segment boundary labels were wrong.** The first merge implementation
   asked the *wrong* neighboring step for a shared boundary's stop
   name/location (a walk-then-bus boundary looked at the walk step, which
   has no stop info, instead of the bus step, which does), silently
   falling back to a generic "Route point" label every time. Caught by a
   unit test asserting the actual stop name against a real-response-shaped
   fixture — visually it would have "worked" (rendered *something*), just
   with worse boundary labels than the data actually supports.
3. **`useSyncExternalStore`'s snapshot functions weren't referentially
   stable.** The recent-trips list read directly from `localStorage` on
   every call (new array each time) and the SSR snapshot was a fresh `[]`
   literal each call — both violate `useSyncExternalStore`'s contract and
   surfaced as a real React console error ("getServerSnapshot should be
   cached to avoid an infinite loop") caught only by loading the page in
   an actual browser, not by `tsc`/`eslint`/`vitest`.
4. **Sort comparator returned non-zero for equal values.** Two locations
   or trips added within the same millisecond (identical `lastUsedAt`)
   sorted unpredictably instead of preserving insertion order, because
   the comparator never returned `0` for ties — a real violation of the
   comparator contract, not just an edge case. Caught by unit tests, not
   manual testing, once the test loop happened to add entries fast enough
   to collide.

## Consequences

- `docs/architecture.md` gained a full "Location & routing integration"
  section and `docs/data-sources.md` was created (earlier than the
  original plan anticipated, since routing data sources came before
  weather ones).
- Next stage's natural scope is weather-condition data — the first real
  per-segment "observation" data, which is exactly the concern
  `RouteSegment` was kept clean of on purpose (see `architecture.md`,
  "Route domain model").
- Verified with `npm test` (94 tests passing), `next lint`, `tsc
  --noEmit`, `next build`, and extensive real-API browser testing
  (desktop + mobile, DRIVE/WALK/BICYCLE/TRANSIT modes, Vancouver/
  Burnaby/Surrey and one unsupported city, keyboard navigation, recent
  history across a page reload) — see the conversation's final report for
  the full checklist.
