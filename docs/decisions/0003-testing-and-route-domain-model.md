# 0003 — Testing setup and route/segment domain model

**Date:** 2026-09-23

## Context

Two things were needed before going further: automated tests for the
trip logic added in the previous stage (which had already caught one real
bug through manual testing only — see
[0002](./0002-trip-domain-and-input-ux.md)), and a route/segment domain
model, since weather/traffic/transit risk needs to be evaluated per leg of
a journey, not once for the whole trip (see `overview.md`).

## Decisions

### Testing

- **Vitest**, not Jest: zero extra config for TypeScript/ESM under this
  Next.js setup, and only pure-function logic is under test so far (no
  React/DOM tests yet), so no need to pull in jsdom or React Testing
  Library at this stage.
- **`@types/node` bumped from `^20` to `^26`**: `vitest`'s peer range
  (`^22.0.0 || >=24.0.0`) conflicted with the scaffold's original `^20`
  pin. Bumping was the correct fix rather than a workaround — the actual
  Node runtime in this environment is v26, so `^26` types are more
  accurate anyway, and `@types/node` is dev-only so this has no runtime
  effect.
- Tests are colocated as `*.test.ts` next to the module they cover
  (`src/lib/trip/validation.test.ts`, `format.test.ts`), matching how the
  domain code itself is organized by feature area rather than by type.
- `npm test` runs `vitest run` (single pass, not watch mode), matching the
  "quality check" workflow (lint/build/test all run once and must pass).
- **`formatRelativeDayLabel`/`formatTripTime` gained an optional `locale`
  parameter.** Production callers still omit it (falls back to the
  viewer's browser locale, unchanged behavior); tests pass `"en-US"`
  explicitly so assertions don't depend on the locale of whatever machine
  runs them.
- The regression test for the minute-flooring bug from stage 0002
  (`validation.test.ts`: "accepts a trip in the current minute even once
  seconds have elapsed") is deliberately named and commented to explain
  *why* it exists, not just what it checks — the bug was subtle enough
  that a future edit could easily reintroduce it without a comment
  pointing at the original failure mode.

### Route domain model (`src/lib/route/types.ts`)

- **`ResolvedLocation` is a separate type from `TripLocation`.**
  `TripLocation` (`lib/trip/types.ts`) is unverified free text the user
  typed; `ResolvedLocation` has real coordinates and is what a route is
  built from. Nothing produces a `ResolvedLocation` yet — no geocoding
  exists — and that gap is intentional: the types make it impossible to
  accidentally treat "SFU Burnaby" (a string) as a verified point.
- **`SegmentTransportMode` is a separate type from `TransportMode`.**
  `TransportMode` is the one mode the user requested for the trip;
  `SegmentTransportMode` (`walk` | `cycle` | `drive` | `bus` | `rail`) is
  the mode of one leg of the actual route. No conversion function exists
  between them — turning "the user asked for transit" into "walk → bus →
  rail → walk" is real routing/transit logic that doesn't exist until a
  provider is integrated, so a fake or hard-coded mapping would just be a
  guess wearing a type signature.
- **`Route` fields besides `segments` are all optional**, reflecting that
  a route is assembled progressively (segments before baseline duration,
  times before distance, etc.) rather than arriving as one complete
  object.
- **No weather/traffic/transit fields on `RouteSegment`.** The project
  needs three separable concerns for the data-science pipeline later:
  route structure (this type), segment-level observations/features
  (weather, traffic delay, transit alerts), and prediction output (risk
  score, expected duration, confidence). Embedding future condition
  fields directly into `RouteSegment` now would couple route structure to
  a specific data-fusion approach before one is chosen, and would make the
  future evaluation layer (storing predicted vs. actual) harder to build
  cleanly. Types for observations/features/prediction output are not
  created yet — there's no real data source to shape them around, and
  guessing now would likely need to be redone.

## Consequences

- `docs/architecture.md` gained a "Route domain model" section and a
  "What actually exists" section, and its stale "trip domain model" open
  question was replaced with "how a `TripRequest` becomes a `Route`" (the
  actual next unknown).
- The route types are unused by any running code path right now (by
  design — no geocoding/routing integration this stage). They exist so the
  next routing-related stage has a target shape rather than starting from
  a blank slate.
- Verified with `npm test` (28 tests passing), `next lint`, `tsc --noEmit`,
  `next build`, and a manual check that the input page still renders and
  submits correctly after the `format.ts` signature change.
