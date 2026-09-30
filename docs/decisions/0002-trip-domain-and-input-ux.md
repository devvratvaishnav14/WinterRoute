# 0002 — Trip domain model and first input UX

**Date:** 2026-09-22

## Context

The next stage after project foundation (see
[0001](./0001-project-foundation.md)) was to build the trip-request domain
model and the first real input screen — still with no external APIs, no
predictions, and no fake data.

## Decisions

- **Domain model** (`src/lib/trip/types.ts`): `TripRequest` holds `origin`
  and `destination` (currently just `{ label: string }` free text — not
  geocoded), `timePreference` (`arriveBy` | `leaveAt`), a single combined
  `dateTime`, and `mode` (`walk` | `car` | `bus` | `train` | `cycle`).
  `mode` is documented as the user's single selected preference for the
  trip, explicitly not a route plan — a real route may later decompose into
  multiple segments with different modes (e.g. walk → bus → SkyTrain →
  walk). That segment/route model is intentionally not built yet (it needs
  real routing data first); the domain type's doc comment exists so it
  isn't mistaken for one.
- **No normal-commute-time field.** Per the product brief, WinterRoute
  computes baseline/typical time from route data later — asking the user
  for it would contradict that and isn't collected anywhere in the model.
- **72-hour rule** lives in `src/lib/trip/validation.ts` as a pure,
  UI-independent function (`validateTripDateTime`), separate from the form
  component, so it can be unit tested and reused (e.g. if validation later
  needs to also run server-side). It compares against the user's local
  browser time, per the brief.
  - **Bug found and fixed during manual testing:** the form's default date
    "now" is captured once at mount with only minute precision. The first
    version of `validateTripDateTime` compared that against the exact
    instant of submission, so a default value went from "now" to
    "in the past" the instant the wall clock crossed a minute boundary
    after page load — a form nobody touched would reject itself within
    seconds. Fixed by flooring `now` to the start of the current minute
    before comparing, since a minute-precision input equal to "now" should
    never read as past. Caught by driving the actual page in a browser
    (Playwright against the dev server), not by lint/type-check/build alone
    — none of those would have surfaced it.
  - The 72-hour ceiling is enforced both natively (`min`/`max` on the
    `<input type="date">`, computed from the same window constant) and via
    `validateTripDateTime` on submit, since the date input alone can't
    express the time-of-day boundary.
- **Arrive by / Leave at** is a segmented toggle (not a dropdown), defaults
  to "Arrive by," per the brief. Only the UI toggle state exists — no
  departure/arrival calculation is implemented.
- **Location inputs are plain local text fields**, styled as two rows
  inside one shared bordered "route card" (marker dot for origin, marker
  square for destination — a Google Maps-style visual convention) so
  autocomplete/geocoding can be dropped in later without redesigning the
  layout. No autocomplete behavior is implemented or faked.
- **No icon library added.** The five transport-mode icons
  (`src/components/trip/icons.tsx`) are small hand-written inline SVGs,
  per the instruction not to install a UI/icon package for this.
- **Atmospheric background is static CSS only** (`.atmosphere-bg` in
  `globals.css`): layered radial gradients on a dark base, no animation,
  no weather-condition logic. It's a placeholder for the dynamic
  weather-reactive background described in `architecture.md`, not an
  attempt at it — kept deliberately simple so it's obviously temporary.
- **Submitting shows a dev-only trip summary**, visually marked
  "Development preview — captured trip, not a prediction," showing only
  what was actually captured (origin, destination, time preference +
  time, relative day, mode). No duration, risk, weather, or traffic value
  is shown, since none of that exists yet.

## Component structure

`TripForm` (state + validation + submit) composes `LocationInput`,
`TimePreferenceToggle`, `TransportSelector`, and `TripSummary`. Validation
logic (`src/lib/trip/validation.ts`) and formatting helpers
(`src/lib/trip/format.ts`) are kept out of the components so they're
testable independent of React.

## Consequences

- `TransportSelector` and `LocationInput` are the two pieces most likely to
  need rework once real transport-segment data and geocoding/autocomplete
  arrive, respectively — both were kept intentionally small and isolated
  for that reason.
- Verified with `tsc --noEmit`, `next lint`, `next build`, and manual
  browser testing (desktop + mobile viewport, keyboard tab order, both
  valid and 72-hour-violating submissions) rather than relying on the
  build passing alone — that's what caught the validation bug above.
