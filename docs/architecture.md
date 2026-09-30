# WinterRoute — Architecture

Status: domain/config, location/routing, and weather ingestion are real —
see "What actually exists" below. Scoring and evaluation are still
**proposal**, described here as target shape. This document exists so
later stages have a target shape to build toward incrementally, and so
the reasoning is recorded before it's forgotten.

## Confirmed current setup

Verified by inspecting the repo directly (not assumed):

- Next.js 16.3.6, App Router, `src/` directory, TypeScript (strict mode),
  Tailwind CSS v4 (via `@tailwindcss/postcss`), ESLint 9 flat config.
- Only the default scaffold exists: `src/app/layout.tsx`, `src/app/page.tsx`,
  `src/app/globals.css`, default public assets.
- Path alias `@/*` → `./src/*` is already configured in `tsconfig.json`.
- This Next.js version ships its own doc set at
  `node_modules/next/dist/docs/` and regenerates the `AGENTS.md` block on
  `next dev` — confirmed by reading
  `node_modules/next/dist/server/lib/generate-agent-files.js` and the
  matching `node_modules/next/package.json` version. Conventions referenced
  in this document (e.g. `proxy.ts` instead of `middleware.ts` for request
  proxying) come from that local doc set, checked against this installed
  version rather than assumed from training data.

No structural changes were made to `src/` in this first stage — the default
scaffold is already a reasonable, unopinionated starting point, and adding
folders/files before there's real code to put in them would just be
speculative scaffolding.

## What actually exists

- `src/lib/trip/` — `types.ts` (`TripRequest`, `TransportMode`,
  `TimePreference`), `validation.ts` (72-hour rule + form validation),
  `format.ts` (display formatting). Pure TypeScript, no React.
- `src/lib/route/` — `types.ts` (`ResolvedLocation`, `SegmentTransportMode`,
  `RouteSegment`, `Route`), `format.ts` (route preview formatting),
  `computeRoute.ts` (orchestrates a `TripRequest` → real `Route`; see
  "Location & routing integration" below). See "Route domain model" below
  for the types themselves.
- `src/lib/google/` — the Google Maps Platform provider/adapter layer:
  `config.ts` (server-only API key access), `places.ts` (Places API (New)
  HTTP calls), `routes.ts` (baseline Routes API `computeRoutes` HTTP
  calls), `trafficRoutes.ts` (traffic-aware `computeRoutes` HTTP calls —
  a separate request shape from the baseline, see "Traffic data
  pipeline" below), `polyline.ts` (Google polyline decoding, shared by
  both), `transform.ts` (Google response ⇄ WinterRoute domain — the only
  place that knows both shapes).
- `src/lib/geo/` — `serviceArea.ts` (V1 municipality support check),
  `geometry.ts` (haversine distance, distance-weighted point-along-path
  interpolation — shared math used by weather route sampling and traffic
  interval distance-weighting).
- `src/lib/storage/` — `safeStorage.ts` (localStorage wrapper that never
  throws), `recentLocations.ts`, `recentTrips.ts`.
- `src/lib/client/` — `placesClient.ts`, `routesClient.ts`,
  `weatherClient.ts`, `trafficClient.ts`, `apiError.ts`: the browser's
  typed wrappers around WinterRoute's own `/api/*` routes (never Google/
  Open-Meteo/ECCC/DriveBC directly — see "Security architecture" below).
- `src/app/api/places/{autocomplete,details}/route.ts`,
  `src/app/api/routes/compute/route.ts`,
  `src/app/api/weather/analyze/route.ts`,
  `src/app/api/traffic/analyze/route.ts` — Next.js Route Handlers; the
  only server code allowed to call external providers.
- `src/lib/weather/` — the weather data pipeline: `types.ts` (domain
  model), `sampling.ts` (route → sample points), `timeline.ts` (nominal
  Arrive-By baseline), `providers/openMeteo.ts` + `providers/eccc.ts`
  (HTTP mechanics), `transform.ts` (Open-Meteo → `WeatherForecastPoint`),
  `alerts.ts` (ECCC → `WeatherAlert` + route relevance), `ensemble.ts`
  (descriptive model comparison), `overview.ts` + `format.ts`
  (route-wide summary for the preview UI), `weatherCodes.ts` (WMO code
  lookup), `analyzeRouteWeather.ts` (orchestration). See "Weather data
  pipeline" below.
- `src/lib/traffic/` — the traffic data pipeline: `types.ts` (domain
  model), `timeline.ts` (nominal Arrive-By baseline + near-term/future
  classification — the traffic-specific counterpart to
  `lib/route/timeline.ts`), `transform.ts` (Google traffic-aware result →
  `TrafficAnalysis`, delay calculation), `roadEvents.ts` (Open511 →
  `RoadEvent` + spatial/temporal relevance, including
  `parseVancouverLocalDateTime`), `requestCache.ts` (in-memory TTL cache +
  in-flight dedup), `format.ts` (condition-breakdown percentages for the
  preview UI), `providers/driveBC.ts` (HTTP mechanics),
  `analyzeRouteTraffic.ts` (orchestration). See "Traffic data pipeline"
  below.
- `src/components/trip/` — `TripForm`, `LocationAutocomplete`,
  `TimePreferenceToggle`, `TransportSelector`, `RoutePreview`,
  `WeatherPreview`, `TrafficPreview`, `RecentTrips`.
- Tests: Vitest, colocated as `*.test.ts`/`*.test.tsx` next to the module
  under test. Pure-logic modules run in Vitest's default `node`
  environment; a few files that need real browser APIs (`localStorage`,
  the DOM) opt into `jsdom` per-file via a `// @vitest-environment jsdom`
  comment, rather than switching the whole suite to jsdom and paying that
  cost for tests that don't need it. `@testing-library/react` +
  `@testing-library/user-event` were added specifically for the one
  component whose correctness depends on real user interaction sequencing
  (`LocationAutocomplete` — see its ADR). Run with `npm test`.

## Route domain model

A trip request (what the user typed and picked) and a route (the actual
computed journey) are deliberately different types:

- **`TripRequest.origin`/`.destination`** are now `ResolvedLocation`s —
  real coordinates from a verified Google Places selection, not raw typed
  text. Unresolved text is deliberately *not* a formal domain type; it's
  plain component-local `string` state in `LocationAutocomplete`, because
  there's nothing structured worth saying about text nobody has verified
  yet. A `TripRequest` can only be built once both locations are actually
  resolved (see `lib/trip/validation.ts`), and editing the text after a
  selection invalidates it back to unresolved (see "Location & routing
  integration" below) — so this type can never represent a half-typed
  field pretending to be a real location.
- **`TripRequest.mode`** is the single mode the user requested for the
  whole trip. **`RouteSegment.mode`** (`SegmentTransportMode`) is the mode
  of one leg of the actual computed route. A "transit" request (Bus or
  Train) resolves to real `walk` → `bus`/`rail` → `walk` segments via
  Google Routes — there is still no WinterRoute-authored table mapping a
  requested mode to a segment list; the actual segment sequence always
  comes from the routing provider's real result (see "Location & routing
  integration" below), never guessed.
- **Routes are segmented** because weather/traffic/transit risk affects
  each leg differently (this is core to the project, not an optional
  detail — see `overview.md`): traffic matters a lot for `drive`/`bus`
  segments, much less for `rail`, and `walk`/`cycle` segments carry
  exposure risk (ice, wind, visibility) that has nothing to do with
  traffic. A single trip-level weather check can't represent that; a
  segmented route can.
- **`Route`'s fields (other than `segments`) are all optional** because a
  route is assembled progressively — segments may be known before a
  baseline duration is, times may be known before distance is, etc. Code
  consuming a `Route` should never assume it's "complete."
- **`baselineDurationMinutes`** is filled in by the routing provider (see
  below) — never user-entered (the input form deliberately has no "how
  long does this normally take" field, per the project brief) and never
  computed by WinterRoute itself.
- **Weather/traffic/transit conditions are deliberately not fields on
  `RouteSegment`.** The project needs three separable concerns later: (1)
  route structure (this file), (2) observations/features derived for a
  segment (weather, traffic delay, transit alerts — attached by segment ID,
  not embedded), and (3) prediction output (risk score, expected duration,
  confidence). Folding future weather/traffic fields directly into
  `RouteSegment` would couple route structure to a specific data-fusion
  approach and make the evaluation layer (storing predicted vs. actual)
  much harder to build cleanly. No types for (2) or (3) exist yet — they're
  not needed until there's a real data source to shape them around, and
  guessing their shape now would likely be wrong.

## Location & routing integration (Google Maps Platform)

See `data-sources.md` for *why* Google Maps Platform was chosen and the
limitations discovered while integrating it. This section is about the
architecture of the integration itself.

### Security architecture

`GOOGLE_MAPS_API_KEY` lives in `.env.local` (confirmed git-ignored via
`git check-ignore`), has no `NEXT_PUBLIC_` prefix, and is read only by
`lib/google/config.ts`, which is only ever imported by server-side modules
(`lib/google/places.ts`, `lib/google/routes.ts`) and, transitively, by
Route Handlers. The browser never talks to Google directly:

```
Browser → WinterRoute Route Handler (server) → Google Places/Routes API
```

`lib/client/placesClient.ts` and `lib/client/routesClient.ts` are the
*only* things client components call, and they only ever fetch
WinterRoute's own `/api/places/*` and `/api/routes/compute` routes. If
`GOOGLE_MAPS_API_KEY` is missing, `getGoogleMapsApiKey()` throws
`GoogleConfigurationError`, which every Route Handler maps (via
`lib/api/errors.ts`) to a fixed, generic `503 configuration_error`
response — never the real error object, never anything that could hint at
an env var name or a key fragment. Verified by grepping the production
build output (`.next/`) for the literal key value and for the string
`GOOGLE_MAPS_API_KEY` — neither appears anywhere in `.next/static` (the
client bundle) or anywhere else in `.next`.

### Provider/adapter layer

Three concerns are kept separate, per module:

1. **`lib/google/places.ts` / `lib/google/routes.ts`** — HTTP mechanics
   only. Build a request in Google's shape, call Google, parse the
   response into a *minimal* typed shape containing only the fields
   WinterRoute asked for (via an explicit field mask — see
   `data-sources.md`). No knowledge of WinterRoute's domain types.
2. **`lib/google/transform.ts`** — the only module that imports *both*
   Google's shapes and WinterRoute's domain types. Converts a resolved
   Google place into a `ResolvedLocation`, converts a `TransportMode`
   into a Google travel mode + transit preference, and converts a
   `computeRoutes` result into a `Route`/`RouteSegment[]` (segment
   merging + timing derivation — see below).
3. **`lib/route/computeRoute.ts`** — orchestration. Decides *when* to ask
   Google for a timestamp, which `routingPreference` to use, etc. Route
   Handlers call this; they don't build Google request shapes themselves.

Nowhere else in the app imports from `lib/google/*` directly — components
only ever see `ResolvedLocation`/`Route`/`RouteSegment`, never raw Google
JSON.

### Autocomplete session tokens

One logical session (`crypto.randomUUID()`, generated client-side in
`LocationAutocomplete`) covers everything from the first keystroke of a
typing episode through the eventual Place Details call, per Google's
session-token billing model. A new token starts when a field goes from
empty to non-empty; the token is retired (set to `null`, so the next
`ensureSessionToken()` call creates a fresh one) after a Place Details
call completes (success or failure) and on blur. This is a client-side
scheduling detail — nothing to unit-test independently, but exercised by
the `LocationAutocomplete` component tests's live network mocks.

### Unresolved vs. resolved location, enforced

`LocationAutocomplete` holds the resolved `ResolvedLocation | null` as a
value lifted to `TripForm`, and plain `text: string` as its own local
state. The moment `text` changes while a resolved value exists, the
component calls `onChange(null)` — the parent's resolved value is cleared
immediately, before any new selection is made. This is what makes "select
a place, then edit the text" correctly require a fresh selection before
submission — tested directly in
`components/trip/LocationAutocomplete.test.tsx`.

### V1 service area

`lib/geo/serviceArea.ts` checks the resolved place's Google
`addressComponents` for a `locality` component matching Vancouver,
Burnaby, or Surrey (case-insensitive). This runs once, at place
resolution time (`app/api/places/details/route.ts`), not against every
autocomplete keystroke — autocomplete itself is only *biased* toward
Metro Vancouver (`locationBias`, not `locationRestriction`), so a user can
still search for and see an out-of-area place; it's rejected only once
selected, with the field's own resolved value staying `null` and the
*other* field untouched.

**Limitation (documented, not silently assumed away):** `locality` is
Google's own geocoded classification, not an authoritative municipal
boundary lookup. It can be absent for some address types (unincorporated
areas, certain POIs), and this is treated as "unsupported" rather than
guessed. This check is enforced client-side (via the resolution flow) and
is not independently re-verified server-side at `routes/compute` time,
since doing so would require an extra Place Details call purely to
re-derive municipality from coordinates (no reverse-geocoding is
integrated). Consequence: someone could call `/api/routes/compute`
directly with out-of-area coordinates and get a real (billed) route
computed. That's a product-scope gap, not a security issue — no data is
exposed either way — but it's a real gap, recorded here rather than
glossed over.

### Recent location & trip history

Both are localStorage-only (`lib/storage/`), namespaced
(`winterroute:recentLocations:v1`, `winterroute:recentTrips:v1`),
versioned (so a future shape change can detect and discard old data
rather than misreading it), and defensively validated on read — corrupted
or wrong-shaped JSON returns `[]` rather than throwing (see
`readJSON`/`writeJSON` in `lib/storage/safeStorage.ts`, and the shape
guards in each module). Only actually-resolved selections and
actually-submitted trips are ever stored — never raw typing, never a
failed/incomplete form.

- **Recent locations** dedupe by Google place ID (falling back to
  rounded coordinates for a location without one), moving a re-selected
  entry to the top rather than duplicating it, capped at 8.
- **Recent trips** dedupe by origin + destination + mode —
  *deliberately not* time preference, so reusing a trip with a different
  arrive-by/leave-at choice updates the one existing entry. Selecting a
  recent trip prefills origin, destination, mode, and time preference,
  but never date/time (reusing a stale date silently would be actively
  wrong) and never auto-submits.
- **`TripForm`'s recent-trips list uses `useSyncExternalStore`**, not
  `useState` + a `useEffect` that calls `setState` — the latter is a
  reasonable-looking pattern that both triggers an avoidable cascading
  render (flagged by `eslint-plugin-react-hooks`'s
  `set-state-in-effect` rule) and doesn't have a completely obvious fix.
  `useSyncExternalStore`'s snapshot function is memoized in
  `recentTrips.ts` (only recomputed when a change is actually signaled)
  and the server snapshot is a module-level constant `[]` — both are
  required for correctness (`useSyncExternalStore` needs a referentially
  stable snapshot between real changes, or React can loop re-rendering),
  and both were bugs caught by browser-testing this stage, not by
  lint/types/build alone (see the ADR).

**Limitation:** convenience data only, per-browser/per-device, no
account/sync. Acceptable for V1; would need a backend once accounts
exist.

### Baseline route

"Baseline" means Google's `staticDuration` — the typical duration
*without* live traffic — never `duration` (which is traffic-aware).
`routingPreference: TRAFFIC_UNAWARE` is set for `DRIVE` specifically to
keep the request itself traffic-agnostic (and, as discovered, Google
requires this: it rejects a timestamp entirely when this preference is
set — see `data-sources.md`). Live traffic is a deliberately separate,
not-yet-built concern (see "Explicitly deferred" below) — nothing here
conflates "baseline" with "what traffic will actually be like."

### Requested mode → Google request, and Google response → segments

`transportModeToGoogleRequest` (`lib/google/transform.ts`) maps Walk→
`WALK`, Car→`DRIVE`, Cycle→`BICYCLE`, Bus→`TRANSIT` (preferring `BUS`
vehicles), Train→`TRANSIT` (preferring `RAIL` vehicles, which Google's
own `TransitPreferences.allowedTravelModes` documents as covering
`SUBWAY`/`TRAIN`/`LIGHT_RAIL`). This is a *preference* passed to Google,
not a guarantee.

Google's raw `computeRoutes` response has turn-by-turn granularity (a
20-minute drive can be 15+ steps). The merge rule, in
`buildSegmentsFromGoogleSteps`: consecutive steps with the same Google
`travelMode` merge into one segment, **except** `TRANSIT` steps, which
never merge with each other even if they'd map to the same
`SegmentTransportMode` — each `TRANSIT` step is one real ride (its own
line, stops, schedule), so merging two would silently erase a transfer.
Every internal segment boundary in a real `TRANSIT`-mode response has a
`TRANSIT` step on one side (Google only mixes travel modes within
`TRANSIT` responses, via `WALK` connectors), so that neighbor's stop
name/location is used as the shared boundary point — not a generic
"Route point" fallback, which exists only as a defensive case for a
response shape not observed in practice. Segment start/end times: a
`TRANSIT`-derived segment carries Google's own real schedule timestamps
directly; every other segment's time is derived by propagating outward
from whatever *is* known (a neighboring transit segment's real time, or
the user's chosen "leave at" instant) via `deriveSegmentTimes` — see the
function's doc comment for the exact two-pass algorithm. All of this is
tested against small, real-response-shaped fixtures in
`lib/google/transform.test.ts`, not large recorded payloads.

### Arrive By / Leave At — current behavior and limitation

For `TRANSIT`, both directions are sent to Google as-is (`arrivalTime`
for Arrive By, `departureTime` for Leave At), and Google solves a real
schedule either way. For `DRIVE`/`WALK`/`BICYCLE`, only Leave At is
meaningful to send (and, per the `TRAFFIC_UNAWARE` constraint above,
`DRIVE` never gets a timestamp at all) — **Arrive By on a non-transit
trip does not produce a recommended departure time.** WinterRoute does
not invent one: computing "leave by X to arrive by Y" from a static
duration is a straightforward subtraction, but doing it here would blur
the line between "factual baseline route" (this stage's job) and
"recommendation" (an explicit later-stage concept, once weather/traffic
adjustment exists — see `overview.md`). The route preview simply omits
`departureTime`/`arrivalTime` for that case rather than showing something
half-true.

## Weather data pipeline

See `data-sources.md` for *why* Open-Meteo and ECCC specifically were
chosen and the limitations discovered integrating them. This section is
the architecture of the pipeline itself: how a computed `Route` becomes a
`RouteWeatherAnalysis`.

### Why one weather source isn't enough

A single forecast is one model's guess, presented with false certainty if
shown alone. WinterRoute's whole premise (see `overview.md`) is that
commute risk depends on genuine uncertainty — how much models agree,
how far out the trip is, how conditions vary along the route — none of
which a single number can express. Multiple independent models are the
only way to eventually say something honest like "models disagree on
whether this will be rain or snow" instead of asserting one.

### Why each model's forecast is preserved separately, never pre-averaged

This is a data-science requirement, not a UI preference. WinterRoute's
long-term goal (see `overview.md`, "Model validation") is storing
*predicted vs. actual* to measure and eventually calibrate model
performance — which requires knowing which model said what. Averaging
three models into one number at ingestion time destroys that
permanently; there's no way to recover "GFS predicted 0.9mm, Canadian
predicted 4.1mm" from a stored "2.6mm average" later. `RouteWeatherSample.forecasts`
is therefore an array — one entry per model that actually had data —
never collapsed, with `ensemble` computed *alongside* it as a derived
summary, not a replacement.

### Why there's no model weighting yet

Weighting one model over another ("HRDPS 50%, ECMWF 30%, GFS 20%") would
need empirical evidence — historical accuracy per model, per season, per
region — that doesn't exist yet (see "Future validation plan" below).
Inventing weights now would be exactly the kind of unjustified precision
this project's accuracy philosophy explicitly rejects (`overview.md`).
`lib/weather/ensemble.ts` computes only transparent descriptive statistics
(median/min/max, "N of M models predict precipitation") — see "Model
agreement vs. confidence" below for why that's a deliberate, principled
choice and not a gap.

### Forecast horizon handling (Canadian HRDPS/RDPS strategy)

HRDPS (2.5km resolution) is preferred for its precision, but its real
forecast horizon is roughly 48-60 hours from request time — confirmed
empirically (see `data-sources.md`), not read off a spec sheet, because
Open-Meteo doesn't publish an exact cutoff and the true horizon can shift
run to run. RDPS (10km) covers WinterRoute's full 72-hour window
comfortably. Rather than hardcoding "switch to RDPS after 48 hours" (the
project brief explicitly warns against silently extending a model past
its real coverage), `analyzeRouteWeather` always fetches **both** for
every sample point and, per point, uses HRDPS's value only if that hour
is genuinely covered (a real, non-null value at the matched hour — see
`openMeteoResultToForecastPoint` in `lib/weather/transform.ts`),
otherwise falls back to RDPS. On a single trip whose route spans several
hours, this means near-departure samples can use HRDPS while
later samples on the same trip use RDPS — each sample's `forecasts[]`
entry names exactly which one it got (`"Canadian HRDPS"` vs.
`"Canadian RDPS"`), so this is never hidden.

ECMWF IFS and GFS both comfortably cover the full 72-hour window and
need no horizon-switching logic — they're each a single model requested
directly by name (`ecmwf_ifs025`, `ncep_gfs013`), never Open-Meteo's
auto-blended "best match," which would silently obscure which underlying
model actually produced a value.

### Route weather sampling

`lib/weather/sampling.ts` (`buildRouteWeatherSamples`) — pure, tested
independently of any provider. Every segment boundary (origin, each
mode/transfer transition, destination) is always included — these are
the geographically meaningful transitions the project cares about (e.g.
leaving Burnaby Mountain's elevation for a SkyTrain corridor at sea
level), and are never sacrificed for a sampling budget. Remaining budget
(target 7, hard cap `MAX_SAMPLE_POINTS = 10`) is distributed across
segments longer than 3km, proportional to distance, placed along the
segment's real road/path geometry (`RouteSegment.geometry`, decoded from
Google's polyline — see "Route geometry" below) rather than a straight
line, which matters for a segment that curves around terrain. A segment
under 3km (e.g. a 5-minute walk to a bus stop) gets no intermediate
samples — conditions won't meaningfully vary across it, and it would
waste sampling budget that a long segment can use better.

Real-world result confirmed live (see the conversation's final report for
the full test log): a 9-segment multi-modal transit trip (walk → bus →
walk → rail → walk → bus → walk → bus → walk) produced exactly 10
samples — every one of its unique segment boundaries, hitting the cap
with no room left for intermediates, which is the correct behavior for a
route that's already geographically detailed by its segment structure
alone.

### Route geometry

Added specifically to make the above possible — the previous stage's
`RouteSegment` had no path data (a deliberate simplification at the time
that turned out to matter once real spatial sampling was needed).
`routes.legs.steps.polyline.encodedPolyline` is now requested from Google
Routes and decoded (`lib/google/polyline.ts`, the standard Google
polyline algorithm, verified against Google's own published reference
example) into `RouteSegment.geometry`, concatenated across the raw steps
merged into each segment. A segment without geometry (shouldn't happen
for a real Google response, but handled defensively) falls back to a
straight line between its start/end for sampling purposes.

### Spatial + temporal alignment

Every sample carries both a coordinate *and* an estimated arrival time
(`RouteWeatherSamplePoint.estimatedTime`) — weather is queried for when
the traveler is actually expected at that point, not one blanket time for
the whole trip. For transit segments this is Google's own real schedule
time; for non-transit segments it's linearly interpolated between the
segment's start/end time (itself derived via
`lib/route/timeline.ts:deriveSegmentTimes`, reused from route
computation — see below). Matching a sample's time against a model's
hourly forecast uses nearest-hour matching within a 90-minute tolerance
(`findNearestHourlyIndex`) — comfortably covers the normal ≤30-minute gap
between an arbitrary minute-precision sample time and hourly forecast
data, while still rejecting a match that's suspiciously far off (treated
as "not covered," never silently matched to a misleading hour).

### Nominal baseline timeline for "Arrive by"

Reuses `lib/route/timeline.ts:deriveSegmentTimes` (the same propagation
logic that times a `Route`'s segments when building it from a Google
result), extracted from `lib/google/transform.ts` into its own module
specifically so it could be reused here without a Google dependency. For
"Leave at" and transit "Arrive by," a route already has real per-segment
times, used as-is. For non-transit "Arrive by," WinterRoute still does
not compute a recommended departure (see "Arrive By / Leave At" above) —
but weather sampling needs *some* timeline, so `lib/weather/timeline.ts`
derives, purely for this purpose:

```
nominalBaselineDepartureTime = tripDateTime - route.baselineDurationMinutes
```

named and typed (`WeatherTimeline.usedNominalBaseline`) so it can never
be confused with a recommendation, surfaced to the user as a small note
("Based on a nominal baseline timeline for this arrival time — not a
recommended departure") rather than silently used. The original `Route`
object's segments are never mutated — a shallow clone is timed instead —
so this nominal timeline can never leak into the factual route preview.

### Forecast variables and units

Requested: `temperature_2m`, `apparent_temperature`, `precipitation`,
`rain`, `snowfall`, `precipitation_probability`, `weather_code`,
`cloud_cover`, `wind_speed_10m`, `wind_gusts_10m`, `visibility` — the 11
variables the domain model actually uses, not Open-Meteo's full catalog.
Open-Meteo's defaults already match WinterRoute's target units for
temperature (°C), precipitation/rain (mm), snowfall (cm), and wind
(km/h) — confirmed via `hourly_units` in a real response, not assumed —
so no conversion is needed for those. `visibility` is the one exception:
Open-Meteo returns metres, normalized to km
(`visibilityKm = metres / 1000`) since WinterRoute displays route-scale
distances in km throughout. Elevation (metres, per the queried grid
cell) is preserved from the provider response on each
`WeatherForecastPoint`, relevant because Burnaby Mountain-type elevation
differences affect temperature and rain-vs-snow — confirmed with real
data showing 332m at SFU Burnaby descending to 3m near the Fraser
lowlands on the same route (see the live-test log). No altitude-based
correction formula is applied — that needs validation this stage
explicitly defers (see `overview.md`'s elevation note).

### Missing data

A model not supporting a variable (confirmed: `visibility` was `null` for
all three named models tested; `precipitation_probability` was `null` for
HRDPS/GFS but present for ECMWF) is represented as `undefined` on
`WeatherForecastPoint` — never a substituted `0`, which would be
indistinguishable from "this model forecasts zero." `temperature_2m`
being `null` at a sample's matched hour is treated as "this model doesn't
cover this point/time at all" (the whole point returns `null` from
`openMeteoResultToForecastPoint`, not just that field) — Open-Meteo nulls
every hourly variable in lockstep once a request exceeds a model's real
horizon, confirmed empirically.

### Partial provider failure

Each of the four Open-Meteo requests (HRDPS, RDPS, ECMWF, GFS) is
independent (`Promise.allSettled` in `analyzeRouteWeather`) — one failing
doesn't block the others, and `RouteWeatherAnalysis.modelStatus` records
exactly which succeeded. If every model fails, samples simply have empty
`forecasts` arrays; `isWeatherDataUnavailable()` detects this so the UI
can show a clear "weather data unavailable" state instead of an
empty-looking success. The ECCC alert check is independent of weather
model success entirely (separate try/catch) — `alertStatus: "unavailable"`
is distinct from `alertStatus: "ok"` with zero alerts, so "we checked and
there's nothing" is never confused with "we couldn't check." All of this
is covered by tests that mock provider failure directly
(`lib/weather/analyzeRouteWeather.test.ts`), not just the happy path.

### Model agreement vs. calibrated confidence

`WeatherEnsembleSummary` reports facts — "3/3 models predict
precipitation," "temperatures range 1.2°C to 3.4°C" — never a confidence
percentage. Model agreement is a signal confidence could eventually be
*derived from*, combined with forecast horizon and source freshness, but
that derivation needs historical validation (see below) that doesn't
exist yet. Presenting raw agreement as if it were calibrated confidence
would be exactly the kind of unjustified precision `overview.md`'s
accuracy philosophy rejects. This is why `RouteWeatherAnalysis` has no
confidence field at all — not because it was forgotten.

### Route-alert matching

ECCC alert geometry (`Polygon`/`MultiPolygon`, real coordinates — see
`data-sources.md`) is checked against actual route sample points via
point-in-polygon (ray-casting, `lib/weather/alerts.ts`), not a
province-wide "there's an alert in BC." An alert with no usable geometry
is treated as not relevant (never assumed relevant by default). ECCC's
`weather-alerts` collection retains ended/expired records rather than
removing them (confirmed with a real feature showing `status_en:
"ended"`) — `isEcccAlertActive` filters on both status and
`expiration_datetime` before an alert is even considered for route
relevance.

### Caching and data freshness

Not implemented this stage as a caching *layer* (no shared cache across
requests) — each trip check makes fresh provider requests. This is
intentional for now: Vercel/Next.js's fetch caching wasn't reached for
because forecast data is trip-specific (different sample coordinates and
times per trip) rather than a shared cacheable resource, and adding a
cache layer before there's evidence of real duplicate-request volume
would be premature. Every value *does* carry the freshness metadata a
future cache (or the evaluation pipeline) will need:
`WeatherModelSource.retrievedAt` on every forecast point,
`RouteWeatherAnalysis.analyzedAt` for the whole analysis, and ECCC's own
`publication_datetime`/`validity_datetime` on every alert. This is
recorded as a real limitation, not silently deferred — see below.

### Explicitly deferred within this stage (and why)

- **No risk score, delay estimate, or confidence percentage anywhere in
  `RouteWeatherAnalysis` or the weather preview.** This stage builds the
  factual foundation those need — building the scoring itself here would
  mean guessing at a model with no validation, which `overview.md`
  explicitly rules out.
- **No traffic or live transit-alert integration.** Weather is the first
  data layer; traffic/transit come after (see `overview.md`).
- **No database / predicted-vs-actual storage yet.** Every analysis is
  computed fresh per request; nothing is persisted. The domain model
  (per-model, per-sample values with full freshness metadata) is
  deliberately shaped so this can be added later without restructuring —
  see "Future validation plan" below.
- **No caching layer** — see above.
- **No server-side re-verification that a submitted route's samples still
  fall in the V1 service area** — inherits the same client-side-only
  limitation already recorded for routing (see "V1 service area" above).

### Future validation plan

Not implemented yet — recorded here so the shape it needs is understood
before it's built. Once real trips are logged, the plan is to store each
`WeatherForecastPoint` actually shown to a user (provider, model, sample
coordinate, valid time, the raw normalized value) alongside what actually
happened at that time and place, then compute per-model error metrics
(e.g. MAE/RMSE for temperature and precipitation, Brier-score-style
calibration for precipitation probability) segmented by forecast horizon
and season. That's what would eventually justify moving from the
descriptive ensemble summary this stage builds to actual model weighting
or a calibrated confidence score — not before.

## Traffic data pipeline

See `data-sources.md` for *why* these specific sources/options were
chosen and the limitations discovered integrating them. This section is
the architecture: how a computed `Route` becomes a `RouteTrafficResult`.

### Baseline vs. traffic-aware, kept distinct

WinterRoute already has a normal/baseline route
(`Route.baselineDurationMinutes`, from a `TRAFFIC_UNAWARE` request — see
"Location & routing integration" above). Traffic analysis is a **second,
separate** `computeRoutes` request (`lib/google/trafficRoutes.ts`,
`TRAFFIC_AWARE_OPTIMAL`) for the *selected commute time* — it never
mutates or replaces the baseline. `TrafficAnalysis` keeps both
`referenceBaselineDurationMinutes` (WinterRoute's own baseline,
untouched) and `googleStaticDurationMinutes` (Google's own `staticDuration`
for *this* traffic-aware request) as separate fields, deliberately not
assumed identical — Google's own docs describe `staticDuration` as "the
duration of travel through the route without taking traffic conditions
into consideration," which is a request-scoped concept, not necessarily
WinterRoute's baseline concept, even though they're usually close in
practice (confirmed live: both 28min for the same SFU→Surrey route on
one real test). Later, WinterRoute will combine baseline + weather +
traffic + transit; that combination doesn't exist yet — this stage only
establishes the traffic observation itself.

### Google traffic-aware routing choice

`TRAFFIC_AWARE_OPTIMAL`, not `TRAFFIC_AWARE` — confirmed via Google's
current `RoutingPreference` reference that `TRAFFIC_AWARE` trades accuracy
for reduced latency ("some optimizations are applied to significantly
reduce latency") while `TRAFFIC_AWARE_OPTIMAL` does not. Since traffic
analysis runs once per explicit "Check my commute" submission (see "Cost
discipline" below), latency isn't the constraint that matters — accuracy
is. `TrafficModel: BEST_GUESS` (not `PESSIMISTIC`/`OPTIMISTIC`) is used as
a single defensible estimate, per the project brief's explicit instruction
not to treat a worst-case scenario as the prediction; `PESSIMISTIC`/
`OPTIMISTIC` remain documented alternatives Google exposes, not implemented
here. `extraComputations: ["TRAFFIC_ON_POLYLINE"]` requests
`speedReadingIntervals` (per-interval `NORMAL`/`SLOW`/`TRAFFIC_JAM`
conditions along the route's own polyline) — billed at Google's higher
"Routes Preferred" rate, a real, deliberate cost decision (see
`data-sources.md`).

### Not all modes are drive

Google traffic-aware routing only applies to `DRIVE` (and `TWO_WHEELER`,
which WinterRoute doesn't use). `TrafficAnalysisResult` is a discriminated
union — `"analyzed"` only ever happens for Car; every other mode gets
`"not-applicable"` with an honest, mode-specific reason
(`lib/traffic/analyzeRouteTraffic.ts`), never a fabricated delay number.
Bus specifically does **not** reuse the Car traffic result — road
congestion is physically real for buses, but applying a car-only delay
estimate to a bus segment would misrepresent it as measured when it
isn't; a real transit-specific source (TransLink reliability data) is
what that needs, and doesn't exist yet. Road events (DriveBC), by
contrast, are checked for **every** mode — they're physically real
regardless of how someone travels the road, so it would be dishonest to
hide a real closure from a bus rider just because the delay-duration
analysis doesn't apply to them. The traffic preview is careful to show
road events without implying they've been converted into a delay figure
for non-driving modes (see "Non-driving preview" in the UI, and
`components/trip/TrafficPreview.tsx`).

### Traffic delay calculation

```
trafficDelayMinutes = max(0, trafficAwareDurationMinutes - googleStaticDurationMinutes)
```

Explicitly named "Google traffic-related delay estimate," never
"WinterRoute expected delay" — the eventual WinterRoute commute
prediction will incorporate weather, road events, and uncertainty on top
of this, and doesn't exist yet. The `max(0, ...)` clamp is a real,
confirmed-necessary guard, not a defensive-programming formality:
**tested live**, an early-morning (5am) departure on the SFU→Surrey route
returned a traffic-aware duration of 24min against a 28min static
duration — genuinely *faster* than the traffic-free reference, which the
clamp correctly reports as "no delay" rather than a nonsensical "-4 min."

### Selected commute time (Leave At / Arrive By)

"Leave at": the user's chosen time, sent to Google as-is. Non-transit
"Arrive by": the same nominal-baseline-departure concept already used for
weather (`nominalBaselineDepartureTime = arrival - baselineDuration`),
computed independently for traffic in `lib/traffic/timeline.ts` since a
DRIVE route is always exactly one segment (no per-segment propagation
needed, unlike weather's multi-segment case) — flagged
`isNominalDepartureTime: true` and surfaced to the user as a note, never
presented as a recommendation, identical discipline to the weather stage.

**A real edge case this surfaced:** an arrival time within the route's own
baseline duration of "now" produces a nominal departure that's
mathematically already in the past
(`nominalDeparture = arrival - duration`, and `arrival ≈ now`). Caught
explicitly before attempting the Google call, with a specific honest
reason, rather than surfacing Google's generic rejection — see
`data-sources.md` "Known limitations" for the exact discovery.

### Future vs. near-term traffic

`TrafficDataRecency` (`"near-term" | "future"`) — `near-term` when the
commute departure is within `NEAR_TERM_THRESHOLD_HOURS` (6, WinterRoute's
own pragmatic choice, not a documented Google cutoff — their docs don't
publish one) of the analysis time; `future` otherwise, up to the 72-hour
limit. This is a labeling distinction only — Google's `duration` field
itself doesn't expose "how live is this," so WinterRoute doesn't claim
more precision than that. Weak supporting evidence that Google's own
results *do* shift in richness with distance was observed but not relied
upon: `speedReadingIntervals` count dropped from 3 (2 hours out) to 1 (68
hours out) for the identical route — consistent with, not proof of, the
near-term/future distinction.

### Traffic condition breakdown (route proportions)

`speedReadingIntervals` indexes into the traffic-aware response's *own*
polyline (requested and decoded specifically for this call —
`lib/google/trafficRoutes.ts` — not assumed identical to the baseline
route's polyline, since a different `routingPreference` can in principle
choose a different path). Each interval's real distance is computed by
summing haversine distances between consecutive polyline points in its
index range (`lib/traffic/transform.ts`), which is what makes a
route-proportion percentage (`lib/traffic/format.ts`,
`computeConditionBreakdown`) defensible — a point-count approximation was
considered and rejected as too crude given the project brief's explicit
caution against fabricating percentages. Returns `null` (never a fake
0/0/0) when there's nothing to compute from, and the preview omits the
section entirely in that case.

### DriveBC / Open511 road events

Provider-neutral `RoadEvent` (`lib/traffic/types.ts`), converted from raw
Open511 features (`lib/traffic/roadEvents.ts`) — only the fields
WinterRoute uses, never a raw event payload reaching the client. Two
independent relevance checks, both must pass:

1. **Spatial** — point-by-point haversine distance against the route's
   real geometry, within 300m (`ROAD_EVENT_PROXIMITY_METERS`). A
   documented, adjustable threshold, not validated against real-world
   accuracy data yet.
2. **Temporal** — the event's `schedule.intervals` checked against the
   trip's commute time. An event *confirmed* not to overlap is excluded;
   an event with *no* schedule data is kept, flagged
   `timeRelevance: "unknown"` — excluding it would claim a certainty
   WinterRoute doesn't have (see "preserve uncertainty" in the project
   brief).

**Timezone handling required real investigation, not an assumption.**
DriveBC's `created`/`updated` fields carry an explicit UTC offset;
`schedule.intervals`, confirmed against real live events, do not.
`parseVancouverLocalDateTime` (`lib/traffic/roadEvents.ts`) treats these
as America/Vancouver local time using the same DST-safe
double-conversion technique the project already established for other
timezone-sensitive parsing — verified in tests against both a summer
(PDT) and winter (PST) date.

**Direction is preserved, not filtered on.** `roadDirection` (e.g. "NB",
"BOTH") is kept as informational metadata. WinterRoute does not attempt
to determine the route's own directionality at the matched point to
compare against it — doing that reliably is real geometry work (bearing
calculation along a path) that wasn't attempted this stage; per the
project brief, preserving the uncertainty (show direction, don't filter
by it) is preferable to a filter that might be wrong in either direction.

**Coverage is not comprehensive.** DriveBC is provincial-highway-oriented
and doesn't cover every local Vancouver/Burnaby/Surrey street. "No
relevant DriveBC events found" is shown with an explicit caveat
(`components/trip/TrafficPreview.tsx`) — never presented as "no road
incidents exist."

### Partial provider failure (traffic)

Google traffic-aware and DriveBC are independent, separately-caught
failures (`lib/traffic/analyzeRouteTraffic.ts`) — one failing never blocks
the other, and neither blocks weather or the route/place layers below
them. `TrafficAnalysisResult.status` (`"analyzed" | "not-applicable" |
"unavailable"`) and `roadEventStatus` (`"ok" | "unavailable"`) are always
both present and independently meaningful — "Google failed, but here are
the road events we found" and "DriveBC failed, but here's the traffic
delay" are both real, tested states
(`lib/traffic/analyzeRouteTraffic.test.ts`), not just theoretical.
`roadEventStatus: "unavailable"` is never conflated with "zero relevant
events" (`ok` + empty array) — the UI's own wording is different for
each, matching the same discipline already used for weather's
`alertStatus`.

### Caching and freshness (traffic)

An in-memory, per-process TTL cache with in-flight-request deduplication
(`lib/traffic/requestCache.ts`) — not a distributed cache, no database
(none exists yet). Its job is narrow: a double page-refresh or two
concurrent requests for the same trip share one upstream call instead of
issuing duplicate ones, and repeated checks of the same trip within a
short window don't re-hit Google/DriveBC every time. TTLs are
deliberately short given the project brief's explicit caution that
traffic is more time-sensitive than forecast-model weather: 2 minutes for
Google traffic-aware results, 5 minutes for DriveBC events. This does not
promise freshness across server restarts or multiple server instances —
an accepted, documented limitation for this stage (see "Explicitly
deferred" below), not a gap discovered later. Every `TrafficAnalysis`
carries `analyzedAt` and `commuteDepartureTime`; every `RoadEvent` carries
`createdAt`/`updatedAt` from DriveBC directly — the freshness metadata a
future shared cache or evaluation pipeline will need either way.

### Data-science preservation

Nothing is discarded that a future evaluation pipeline would need:
`TrafficAnalysis` keeps the normalized duration values (baseline,
Google's static, traffic-aware, delay), the exact commute time analyzed,
provider, and analysis timestamp; `RoadEvent` keeps provider IDs and both
created/updated and effective start/end timestamps. This is what would
eventually let WinterRoute compare a Google traffic delay estimate
against an actually-observed delay, and weather + traffic + road-event
features against real journey outcomes — not implemented this stage (no
database — see below), but nothing here would need to be redesigned to
support it.

### Explicitly deferred within this stage (and why)

- **No commute risk score, weather-driven traffic multiplier, combined
  WinterRoute duration range, recommended departure, or confidence
  percentage anywhere in `RouteTrafficResult` or the traffic preview.**
  This stage establishes the factual traffic observation those need;
  building the combination now would mean guessing at a model with no
  validation.
- **Weather and traffic are not mathematically combined.** Both exist as
  separate analyses (`RouteWeatherAnalysis`, `RouteTrafficResult`) run in
  parallel from the same `TripForm` submission — no code path multiplies
  a snowfall value by a traffic delay, and none should exist until that
  relationship is actually validated.
- **No transit delay *prediction* or crowding prediction** (TransLink
  GTFS-Realtime factual data was integrated in a later stage — see
  "Transit data pipeline" below). Bus/rail get an honest "not applicable"
  for the Google-traffic-derived delay figure specifically — see "Not all
  modes are drive" above.
- **No database / predicted-vs-actual storage.** Every analysis is
  computed fresh per request (short-TTL cache aside); nothing persists
  across server restarts.
- **No map UI.** Traffic intervals and road events have real geometry
  (`TrafficInterval` distances, `RoadEvent.geometry`), kept specifically
  so a future map visualization doesn't need new data — but no
  visualization exists yet. (Update, map stage: this held for road
  events and the route itself, which map cleanly onto
  `RouteSegment.geometry`. `TrafficInterval` turned out to be the
  exception — its polyline-index geometry isn't preserved anywhere the
  map can reach; see "Map visualization architecture" and ADR 0012.)

## Transit data pipeline

See `data-sources.md` for TransLink's exact endpoints, GTFS static source,
quota, and attribution requirement. This section is the architecture: how
a computed `Route`'s real `bus`/`rail` segments become a `TransitAnalysis`.

### Google remains the itinerary; TransLink is enrichment only

`analyzeRouteTransit` (`lib/transit/analyzeRouteTransit.ts`) never invents
or re-plans a journey — it takes the `bus`/`rail` segments Google's route
already produced and attaches TransLink schedule/realtime context to each
one it can confidently match. A request for "Bus" that resolves to a
mixed bus+SkyTrain Google route (confirmed live for SFU→Surrey Central:
Bus 145 → SkyTrain Expo Line → Bus 555 → Bus 337) has **every** transit
segment analyzed, not just ones matching the originally-selected mode —
`route.segments.filter(s => s.mode === "bus" || s.mode === "rail")`, not
`mode === request.mode`.

### Non-transit trips never call TransLink

`TRANSIT_REQUESTABLE_MODES = ["bus", "train"]` — Walk/Car/Cycle requests
return `{ status: "not-applicable" }` before any TransLink fetch, static
or realtime, is attempted (verified live: a Car and a Walk request each
returned in ~2ms, versus 900ms–7s for a real transit analysis). This is
the quota-preservation guarantee the project brief required.

### GTFS static: eager index vs. lazy scan

TransLink's real feed (`https://gtfs-static.translink.ca/gtfs/google_transit.zip`,
confirmed live, updated weekly) has small tables (`routes.txt`: 240 rows,
`trips.txt`: 63,024, `stops.txt`: 8,914, `calendar.txt`: 31,
`calendar_dates.txt`: 823) and one huge one: `stop_times.txt`,
**1,844,734 rows / 91MB uncompressed**. `GtfsStaticStore`
(`lib/transit/gtfsStatic/store.ts`) eagerly parses and indexes the small
tables (by ID, by `route_short_name`, by `route_long_name` — see below —
by `route_id`) in the constructor, but keeps `stop_times.txt` as raw
cached text, scanned on demand via `stopTimesForTrips(tripIds: Set<string>)`
— one linear pass filtered to exactly the candidate trip IDs a caller
already narrowed down by route/service/time, never a persistent parsed
index of all 1.84M rows. A small custom CSV parser
(`lib/transit/gtfsStatic/csv.ts`) handles both the eager tables and the
streamed scan — not worth a dependency for this format. The whole
downloaded+parsed store is cached for 12 hours
(`lib/transit/gtfsStatic/getGtfsStaticStore.ts`) via the same
`getOrFetch` used elsewhere — the feed only actually changes weekly.

### Calendar + service-date logic

`activeServiceIdsForDate` (`lib/transit/gtfsStatic/calendar.ts`) combines
`calendar.txt`'s weekday pattern with `calendar_dates.txt`'s per-date
exceptions — an exception always overrides the weekday default for that
exact date, in either direction (type 1 adds service the weekday pattern
wouldn't otherwise include, type 2 removes service it would). A service
defined *only* via `calendar_dates.txt` (no `calendar.txt` row at all,
legal per the GTFS spec) works correctly since exceptions are applied
independently of whether a base row exists.

GTFS's `HH:MM:SS` times may exceed `24:00:00` for a trip continuing past
midnight, still counted as the *previous* day's service
(`lib/transit/gtfsTime.ts`). `vancouverLocalPartsToDate`
(`lib/time/vancouverTime.ts`, shared with DriveBC's identical naive-local-
time problem — moved there from the traffic stage) naturally rolls an
out-of-range hour (e.g. 25) into the next civil day, so no special-casing
is needed — verified by comparing `(2026-09-24, 25:15:00)` against the
equivalent `(2026-09-25, 01:15:00)`. Because a late-night trip can be
encoded under either the current or the *previous* service day's
`service_id`, matching checks both candidate service dates
(`previousServiceDate`) rather than assuming one.

### Google ↔ GTFS matching

`matchSegmentToGtfs` (`lib/transit/matching.ts`) uses multiple
corroborating signals — never a single one, and never guesses among
genuinely ambiguous candidates:

1. **Route identifier.** Bus routes always have a `route_short_name`
   (e.g. "145", "555") — confirmed live to match Google's
   `transitLine.nameShort` exactly, zero-padding included. **SkyTrain/
   rail routes do not** — confirmed live that the Expo Line's
   `route_short_name` is an empty string in TransLink's real feed. This
   was discovered during live testing (see "Verified live" below) after
   an initial short-name-only implementation left every rail segment
   permanently `unmatched`, which directly broke the "analyze the real
   Bus+SkyTrain route" requirement. Fixed by falling back to
   `route_long_name` ("Expo Line") when a segment has no short name —
   confirmed live to match Google's `transitLine.longName` exactly.
2. **Stop proximity.** Both the segment's start and end must fall within
   150m (`STOP_MATCH_PROXIMITY_METERS`) of a GTFS stop actually on the
   candidate trip, and the origin's `stop_sequence` must precede the
   destination's (rejects a same-route, wrong-direction trip).
3. **Scheduled-time closeness.** The candidate's scheduled departure must
   be within 12 minutes of Google's reported segment start time
   (`DEPARTURE_TIME_MATCH_TOLERANCE_MINUTES`) — loose enough to allow for
   Google's own estimate not being pinned to the exact static schedule,
   tight enough to reject a same-route trip an hour away.

Quality is reported honestly, never guessed: `"exact"` (time delta ≤5
min), `"high-confidence"` (within tolerance but >5 min), `"ambiguous"`
(two or more candidates within 3 minutes of each other in schedule fit —
`ambiguousCandidateTripIds` lists all of them, `tripId` is left unset),
or `"unmatched"` (no candidate cleared all three signals). `stop_times.txt`
is scanned exactly once per analysis — all candidate trip IDs across all
of a route's segments are gathered first, then a single
`stopTimesForTrips` call filters them together.

### Realtime enrichment: Trip Updates

Decoded server-side via the real, maintained `gtfs-realtime-bindings`
library (`lib/transit/providers/translinkRealtime.ts`) — raw protobuf
never reaches the client or the domain layer. **Presence detection
required care**: GTFS-Realtime's `.proto` is proto2, so every field is
wire-presence-tracked, but a naive `!= null` check on a protobufjs-decoded
scalar/enum gives a false positive (the library returns the type's
default value, e.g. `0`, for a genuinely absent field) — the correct
check is `Object.prototype.hasOwnProperty.call(message, field)`, used
throughout the provider layer. Confirmed live via reflection + a live
decode: `TripDescriptor.ScheduleRelationship` and
`StopTimeUpdate.ScheduleRelationship` enum values, and that TransLink's
real feed publishes both `SCHEDULED`/`CANCELED` trips and
`SCHEDULED`/`SKIPPED` stop updates.

**"No update ≠ on time," made structural, not just a comment.**
`buildSegmentRealtime` (`lib/transit/tripUpdates.ts`) only ever runs when
a `TripUpdate` entity was actually found for the matched `trip_id`
(indexed by `indexTripUpdatesByTripId`); when none exists,
`TransitSegmentAnalysis.realtime` is left `undefined` entirely —
architecturally impossible to render as "on time," since there is no
delay field to accidentally default to zero. Scheduled values (from GTFS
static, resolved once during matching) and realtime values are separate
fields end to end; nothing ever overwrites one with the other.

**Recency is evidence, not an assumed cutoff.** `TransitDataRecency` is
`"near-term"` exactly when TransLink is actually publishing a Trip Update
for that specific `trip_id` right now, and `"future"` otherwise —
deliberately not a fixed "realtime applies within N hours" rule (the
project brief explicitly warned against this). **Confirmed live**: a bus
trip departing in ~15 minutes had no Trip Update at all, while a
different trip on the same route that had *already departed* its origin
stop 64 seconds late did — TransLink's realtime coverage tracks vehicles
actually in service, not every future scheduled trip, which is exactly
what motivated an evidence-based rule over a time-window guess.

### Realtime enrichment: Vehicle Positions

`findVehicleObservation` (`lib/transit/vehiclePositions.ts`) is only ever
consulted for a segment already classified `"near-term"` (i.e., realtime-
confirmed) — a future trip never gets a vehicle attached, regardless of
whether some vehicle happens to share its `trip_id`. Freshness is
computed from the position's own `timestamp` field against "now"; a
5-minute threshold (`VEHICLE_POSITION_STALENESS_MS`, matching the
realtime feed's own cache TTL — a position can't be meaningfully fresher
than how often the feed itself is refetched) classifies it `"current"` or
`"stale"`. A position with **no** timestamp at all is treated as
unusable and dropped, never assumed fresh. **Confirmed live that
`occupancy_status`/`occupancy_percentage` are never present on the wire**
(0 of 805 real vehicle entities had true wire-presence for either field,
verified via `hasOwnProperty` after an initial naive check falsely
reported 805/805) — no crowding data exists in this feed, so no crowding
UI was built; this is documented as a real, confirmed absence, not an
oversight.

### Realtime enrichment: Service Alerts

Matched via `informedEntity` (`lib/transit/alerts.ts`), most-specific
field first (`tripId` → `stopId` → `routeId` → agency-wide), AND required
to have an active period overlapping the segment's own scheduled/commute
time — a *future* alert is legitimately relevant to a *future* trip if
its active period covers it (confirmed live: a real Expo Line alert had
`activePeriod.start` with no `end`, i.e. open-ended-forward, which is
correctly treated as still active). Conservative scope on purpose: a
stop-scoped `informedEntity` is checked against exactly the segment's own
origin/destination `stop_id`, never widened to "any stop on the route,"
and a stop-scoped entity that also names a *different* route is excluded
rather than assumed relevant. An entity with no route/trip/stop at all is
system-wide and goes into `TransitAnalysis.systemAlerts`, never attached
to an individual segment.

### Partial provider failure (transit)

GTFS static and the three realtime feeds are fetched independently via
`Promise.allSettled` (`analyzeRouteTransit.ts`). If GTFS static itself
fails, the whole analysis is `"unavailable"` (a source outage) —
deliberately not silently reported as every segment being `"unmatched"`,
which would look like a matching failure rather than a fetch failure. If
only a realtime feed fails, analysis still proceeds on schedule data
alone (`sourceStatus.tripUpdates: "unavailable"`, segments fall back to
`"matched-schedule-only"`) — verified both live (all four sources
returned `"ok"` in every real test run) and via a mocked
trip-updates-failure test.

### Caching and the 1,000/day quota

TransLink's real quota — **1,000 requests/day per API key**, confirmed
via TransLink's own Terms of Use — directly shaped the realtime cache
TTL. Each of the three realtime feeds (`gtfsrealtime`, `gtfsposition`,
`gtfsalerts`) covers the *entire system* per request; polling faster only
shortens staleness, never returns more data. A 5-minute TTL
(`REALTIME_CACHE_TTL_MS`, `lib/transit/getRealtimeFeeds.ts`) across all
three feeds yields a worst case of `3 × (1440 / 5) = 864` requests/day
under continuous traffic — comfortably under the cap, with real headroom
confirmed by the live test session (a handful of transit analyses plus
manual verification calls, nowhere close to triggering the limit). GTFS
static gets its own 12-hour TTL (see above). Both reuse the same
`lib/cache/requestCache.ts` (`getOrFetch`) as weather/traffic — an
in-memory, per-process, in-flight-deduplicating cache, with the same
documented "not distributed, doesn't survive restarts" limitation.

### Data-science preservation

Nothing needed for a future evaluation pipeline is discarded:
`TransitSegmentAnalysis` keeps scheduled *and* realtime times/delays as
always-separate fields, the exact GTFS `route_id`/`trip_id`/`service_id`
matched, match quality and evidence strings, and vehicle
position/freshness when available. Missed-transfer risk *data* (the
segments' own scheduled/realtime timing) is preserved without computing a
missed-transfer *probability* — that calculation doesn't exist yet, per
the project brief.

### Explicitly deferred within this stage (and why)

- **No commute risk score, transit-delay prediction, crowding
  prediction, missed-transfer probability, confidence percentage, or map
  UI.** This stage establishes the factual transit observation those
  need. Vehicle coordinates are stored in a clean, typed shape
  (`TransitVehicleObservation.latitude/longitude`) specifically so a
  future map doesn't need new data — no visualization exists yet.
- **No database.** Every analysis is computed fresh per request (cache
  TTLs aside); nothing persists across server restarts.
- **No crowding UI**, because TransLink's real feed doesn't publish
  occupancy data at all — confirmed live, not assumed.

## Feature engineering & experimental risk model (V0)

See `docs/decisions/0008-risk-model-v0.md` for the full rationale and
required "no claim of accuracy" framing. This section is the
architecture: how the now-complete factual layers (route, weather,
traffic, road events, transit) become `lib/scoring/`'s
`ExperimentalCommuteRiskV0`.

### Why heuristic V0, not ML

Per the project brief, there is no historical outcome dataset (predicted
conditions vs. actual commute disruption) to train or calibrate a model
against yet. Building one now would mean inventing labels, which would
make the whole pipeline less defensible, not more. `lib/scoring/` is
instead built as a pipeline whose LATER stages (subscore curves, factor
weights) can be replaced by statistically calibrated or learned
relationships once real outcome data exists — the layering itself
(features → factor scores → overall index) doesn't need to change, only
what computes each step.

### Distinct layers, never scoring raw provider data

```
Route + RouteWeatherAnalysis + RouteTrafficResult + TransitAnalysis
  -> SegmentFeatureSet[] / CommuteFeatureSet   (lib/scoring/*Features.ts, buildFeatures.ts)
  -> FactorScore per factor                     (lib/scoring/*Score.ts)
  -> ExperimentalCommuteRiskV0                   (lib/scoring/overallRisk.ts, explanation.ts, computeCommuteRisk.ts)
```

`computeCommuteRisk` is the single entry point — pure and deterministic
(no fetching, no I/O; same output for the same input every time). It runs
entirely client-side in `TripForm.tsx` once weather/traffic/transit have
all settled (success or failure), since it's a transformation of
already-fetched data, not a new external call.

### Segment vs. route-level features

`SegmentFeatureSet` carries per-segment weather (only from samples the
weather-sampling module itself tagged with that segment's ID — see
"Weather integration" above for why a segment can genuinely have zero
samples), traffic (only ever `"available"` for a `drive` segment — Google's
traffic-aware data has no finer granularity than the whole route in the
current domain model, so a `drive` segment is attributed the route-level
values directly, documented as a V0 simplification), transit (only for
`bus`/`rail`), and road events (attributed by the same 300m geometric
proximity check `lib/traffic/roadEvents.ts` already uses for route-level
relevance). `CommuteFeatureSet` aggregates these plus route-wide weather
(computed from every sample, including the untagged final-destination
point) and factual temporal/context features.

### Exposure weighting

A segment's influence on the weather factor's route-level average is its
`routeDurationShare` (`segment.durationMinutes / totalRouteDuration`) —
deliberately duration-based, not distance-based, since two segments of
equal length can take very different times (e.g. a slow uphill walk vs. a
fast downhill one), and duration is what actually determines how long
someone is exposed to a condition. A segment with **no** weather data is
excluded from both the numerator and denominator of that average
entirely — never averaged in as an implicit zero, which would understate
real conditions on a route where sampling budget left one segment
uncovered.

### Mode-aware weather exposure

`config.weather.modeSensitivity` scales each weather phenomenon's raw
0-100 curve score by how much that phenomenon matters for the segment's
ACTUAL mode (`walk`/`cycle`/`drive`/`bus`/`rail`) — e.g. wind matters far
more for cycling than driving; `rail` (SkyTrain) is scored near-zero for
every weather phenomenon, since it's largely weather-protected and its
real disruption risk is a transit-factor concern, not a weather one. A
segment's overall weather value is the **maximum** mode-adjusted
phenomenon score, not a sum — see "Avoiding double counting" below.

### Avoiding double counting

Several signals in this system are correlated observations of the same
underlying phenomenon, and summing them naively would double-count it:

- **Weather phenomena within one segment**: combined via `max`, not sum —
  a segment already forecast for heavy snow and a freezing temperature is
  describing one severe winter-weather event, not two independent risks.
  Freezing/near-freezing conditions are listed as their own named
  contributions (for transparency) but only the single highest
  mode-adjusted value sets the segment's base severity.
- **Traffic delay vs. traffic-jam route share**: `trafficDelayMinutes` is
  the dominant, primary signal; `trafficJamRouteShare`/`slowRouteShare`
  are added only as small, capped corroborating bonuses (`lib/scoring/
  trafficScore.ts`) — both ultimately describe the same congestion Google
  already measured once.
- **Road events**: the single highest-severity event sets the base score;
  additional relevant events add a small, capped bonus rather than each
  contributing full independent severity.
- **Transit disruption signals** (delay, cancellation, skipped stop,
  alert severity): combined via `max`, not sum, since e.g. a cancellation
  and a "significant delays" alert about the same trip are two views of
  one disruption, not two separate ones — except the cancellation floor
  (below), which is an explicit, documented exception.

### The cancellation floor (an explicit exception to "combine by max")

Per the project brief, "a factual canceled matched transit trip is a
major disruption signal... the score may reflect this strongly."
Implemented as `transitScore = max(combinedScore, canceledTripScore)`
when any matched segment is canceled — a cancellation is never diluted by
averaging with an unrelated, less severe delay/alert value on a different
segment of the same trip.

### Overall index: mode/duration-weighted, normalized over applicable factors only

`config.overall.modeFactorRelevance` says how relevant each factor
(weather/traffic/transit/roadEvents) is for each ACTUAL segment mode. The
route's overall factor weighting is the duration-weighted average of
these across its real segments (`lib/scoring/overallRisk.ts`,
`computeRawFactorWeighting`) — a mixed trip's weighting reflects its
actual segment-duration composition, not just the single mode the user
originally selected.

Critically, normalization happens **only over factors whose `FactorScore.status`
is `"scored"`**. A `"not-applicable"` factor (e.g. traffic for a pure walk
trip) or an `"unavailable"` one (a failed fetch) is dropped from both the
numerator and denominator entirely — never averaged in as an implicit
zero, which would artificially understate risk for exactly the trips
where a factor's absence is most likely to matter. If literally every
factor ends up unavailable/not-applicable (an extreme, degenerate case),
the index is `0` purely because there's nothing to sum — an absence of
evidence, not evidence of low risk; `dataCoverage` on the result will
show this combination and a caller/UI should treat it specially rather
than reading the index at face value. See "Known weaknesses" in the ADR.

### The index is not a probability

`ExperimentalCommuteRiskV0.overallIndex` (0-100) is an interpretable
heuristic severity score, not a calibrated probability — a value of 78
means "given the currently available evidence, this trip has relatively
high disruption severity under WinterRoute V0's transparent model," never
"78% chance of disruption." Nowhere in the code, UI, or documentation is
this value described as a percentage chance — see `types.ts`'s doc
comment on `ExperimentalCommuteRiskV0` and the risk preview component's
own on-screen disclaimer.

### Deterministic explanation, no LLM

`lib/scoring/explanation.ts` builds one template sentence per applicable
(`"scored"`) factor directly from its own engineered feature values —
never an LLM call, never randomized prose. Dominant factors are the top
2-3 contributors by weighted contribution, named by their most specific
driving sub-factor (e.g. "Snowfall," not just "Weather").

### Data coverage, kept separate from severity

`DataCoverage` (weather: complete/partial/unavailable; traffic:
complete/partial/not-applicable/unavailable; transit:
realtime/scheduled-only/partial/not-applicable/unavailable; roadEvents:
checked/unavailable) is reported alongside, never folded into, the
overall index — a low index computed from complete data and a low index
computed from mostly-unavailable data look identical numerically unless a
caller also checks `dataCoverage`, which is why the risk preview always
shows both. This is deliberately not collapsed into a single fake
confidence percentage.

### Bus/vehicle crowding: confirmed out of scope for V1

TransLink's real GTFS-Realtime feed was confirmed (transit stage) to
publish no usable `occupancy_status`/`occupancy_percentage` data (see
"Realtime enrichment: Vehicle Positions" above and
`docs/data-sources.md`). `lib/scoring/` therefore has no crowding
feature, no crowding subscore, and no crowding UI anywhere — this is a
deliberate, evidence-based V1 scope decision, not an oversight, and the
technical finding that motivated it is preserved rather than deleted
(see `docs/decisions/0007-transit-data-integration.md` and
`docs/decisions/0008-risk-model-v0.md`).

### Explicitly deferred within this stage (and why)

- **No expected commute duration or recommended departure time.** Risk
  severity and delay *prediction* are related but distinct models; this
  stage only establishes the interpretable severity index.
- **No calibrated confidence percentage.** `DataCoverage` reports
  completeness qualitatively; nothing here claims "the model is X%
  confident."
- **No machine learning.** See "Why heuristic V0, not ML" above.
- **No persistent prediction database.** `computeCommuteRisk` runs fresh
  per request from already-in-memory data; nothing is stored across
  requests. See "Future validation design" in the ADR for how this would
  eventually work.
- **No map visualization, no dynamic weather animation, no final
  polished results page.**

## V0 hardening: prediction availability, not just severity

See `docs/decisions/0009-v0-hardening-and-evaluation-design.md` for full
rationale. This section covers the fix for V0's most significant known
weakness — that an absence of evidence could previously read as a
confirmed low-risk result — plus the reusable scenario-matrix validation
harness built alongside it.

### The "no data == Low" problem, and its fix

Before this stage, `computeOverallRisk` correctly excluded
not-applicable/unavailable factors from its weighted average, but there
was no signal distinguishing "every factor came back 0 because conditions
are genuinely calm" from "every factor came back 0 because nothing could
be scored at all." Both cases produced the same `overallIndex: 0, label:
"Low"`.

`RiskPredictionStatus` (`"available" | "limited-data" |
"insufficient-data"`, `lib/scoring/sufficiency.ts`) fixes this by
answering a separate question before the index is ever displayed: is
there enough evidence to defend a score at all? `overallIndex`/`label`
are still computed unconditionally (a plain bounded number, useful
internally and for debugging), but `RiskPreview.tsx` now gates what it
shows on `predictionStatus`, not on the index — when
`"insufficient-data"`, the component renders "Risk estimate unavailable"
and a list of missing essential sources, never a number.

### Mode-aware, forecast-horizon-aware sufficiency

`config.sufficiency.essentialFactorsByMode` says which factor(s) are
essential for each ACTUAL segment mode (`walk`/`cycle`: weather;
`drive`: weather + traffic; `bus`/`rail`: transit). A route's essential
set is the UNION of these across every distinct mode it actually
contains — a mixed walk+bus trip needs *either* weather or transit
evidence to be scoreable at all.

```
essentialScored = essential factors that are "scored"
applicableUnavailable = applicable (not "not-applicable") factors that are "unavailable"

essentialScored.length === 0        -> "insufficient-data"
applicableUnavailable.length === 0  -> "available"
otherwise                            -> "limited-data"
```

This reproduces the project brief's own worked example exactly: a drive
trip with weather available, traffic unavailable, road events checked
→ `"limited-data"` (traffic is essential but not the ONLY essential
factor for drive, and weather still gives real evidence) — not
`"insufficient-data"`.

**No separate forecast-horizon rule was needed** — horizon-awareness
falls out of decisions already made in the transit/traffic stages: a
far-future transit trip with no realtime update yet is `"scored"` at the
factor level (`matched-schedule-only` is valid evidence, never
`"unavailable"` — see "No update ≠ on time" in the transit section
above), so it never trips the "essential factor missing" check just
because it's far away. Verified live: a real 20-hour-out SFU→Production
Way transit request correctly returned `predictionStatus: "limited-data"`
(only because weather was deliberately omitted in that specific check,
not because of the transit horizon) with `transit: { status: "scored",
score: 0 }` — exactly the intended behavior.

### A real semantic bug found by the scenario matrix

Building the scenario matrix (below) surfaced a genuine bug: the
transit-disruption cancellation floor (`canceledTripScore`, previously
92) could be *undercut* by an extreme-but-still-running delay saturating
`delayCurve` at its own maximum of 100 — meaning a badly delayed but
technically-still-operating trip could outscore an actual cancellation.
That's backwards: a rider can eventually complete a very late trip, but
not a canceled one on that specific service. Fixed by raising
`canceledTripScore` to 100 (the curve's own ceiling), so a cancellation
can never be undercut by a mere delay, however extreme. See
`config.ts`'s comment on `canceledTripScore` and
docs/decisions/0009-v0-hardening-and-evaluation-design.md.

### Scenario-matrix validation harness

`lib/scoring/scenarios.ts` defines 33 named scenarios (clear/normal per
mode, rain/snow at three intensities, freezing, wind, traffic at three
levels, six transit-disruption states, three road-event severities, four
provider-failure combinations, and four mixed-conditions cases) built
from realistic *synthetic* features — never real provider JSON. Two
consumers:

- `scenarios.test.ts` — automated invariants over the whole matrix
  (bounded/non-NaN scores, valid `predictionStatus`, a real spread of
  index values rather than a compressed/saturated distribution, sensible
  ordering within categories, and the specific "insufficient vs. limited"
  provider-failure distinction).
- `scripts/riskScenarios.ts` — a development-only CLI (`npm run
  scenarios`) that prints every scenario's full result (features, factor
  scores/contributions, index, label, prediction status, data coverage)
  for manual inspection. Not a user-facing dashboard.

### Boundary testing

Every scoring threshold's exact edge is tested directly: `labelFor`
(now exported specifically for this) at 29/29.9/30, 54/54.9/55,
74/74.9/75; `scoreOnCurve`/`scoreOnInverseCurve` at their exact
`lowValue`/`highValue` breakpoints and just inside/outside them. This
exists specifically to catch a `<` vs `<=` mistake that would otherwise
only show up as a barely-perceptible discontinuity.

## Prediction-evaluation architecture (types and tooling only — not persisted)

A new `lib/evaluation/` module defines the data structures needed to
eventually compare a WinterRoute prediction against a real observed
outcome — **no database, no persistence, no user-facing outcome
collection exists yet**; this is architecture and dev tooling only, per
this stage's explicit scope. See
`docs/decisions/0009-v0-hardening-and-evaluation-design.md` for the full
design and its validation metrics/privacy/versioning discussion.

### PredictionSnapshot: an immutable historical record

`createPredictionSnapshot` (`lib/evaluation/createSnapshot.ts`) wraps an
already-computed `ExperimentalCommuteRiskV0` (plus the small amount of
trip context it doesn't itself carry — the user's originally requested
mode/time-preference/selected time) into a `PredictionSnapshot`. It
stores the FULL engineered `CommuteFeatureSet`, never raw
Google/Open-Meteo/GTFS/DriveBC responses — this is what makes it
reproducible later without refetching anything, and what keeps a stored
prediction small. Every function in this module takes a snapshot and
returns a new value; nothing mutates one in place, which is what "behaves
as an immutable historical record" means in practice here — if tomorrow's
forecast changes, an old snapshot still reads as exactly what was
predicted at its own `createdAt`.

### Model/config versioning and the config fingerprint

`modelVersion` (`"winterroute-risk-v0"`) is the coarse version — a future
scoring change materially altering outputs should mint a new one, never
silently reinterpret old scores under the same name.
`computeConfigFingerprint` (`lib/scoring/configFingerprint.ts`) is a
finer-grained, deterministic (explicitly NOT cryptographic — a stable
djb2 hash over sorted-key JSON) fingerprint of the exact `riskModelV0Config`
used, so a stored prediction can later be traced to precisely which
thresholds/weights produced it, even within the same `modelVersion`.

### Reproducibility

`reevaluateSnapshot`/`checkReproducibility` (`lib/evaluation/reproduce.ts`)
re-run `scoreFeatures` (the newly-extracted pure core of
`computeCommuteRisk`, taking a `CommuteFeatureSet` directly — see
`computeCommuteRisk.ts`) against a stored snapshot's own
`featureSnapshot`, with no provider refetch at all. Comparing the
re-evaluated result against the snapshot's own stored `configFingerprint`
is what lets a future analysis distinguish "the scoring model changed"
from "the provider data changed" for the same historical case.

### CommuteOutcome and provenance

A separate, entirely optional-fielded `CommuteOutcome` type
(`lib/evaluation/types.ts`) represents what actually happened — every
field wrapped in `ProvenancedValue<T>` (`{ value, provenance }`,
`provenance` one of `"provider-observed" | "user-reported" | "derived" |
"unavailable"`) so an eventual user-reported arrival time is never
conflated with an officially-observed weather reading.
`assessOutcomeCompleteness` (`lib/evaluation/outcome.ts`) derives
`"none"`/`"partial"`/`"complete"` from which optional fields are actually
present — never assumed complete just because a record exists. No
user-facing survey/form exists to collect any of this yet.

### Privacy: a storable variant with no precise location

`CommuteFeatureSet` already carries no raw coordinates anywhere (a
property of the previous stage's feature-engineering design, not
something added here). Its two location LABELS
(`originLabel`/`destinationLabel`) are the only fields that could be
identifying (e.g. an exact typed-in home address).
`toStorableSnapshot` (`lib/evaluation/privacy.ts`) drops them entirely
from a FUTURE-storage-shaped `StorablePredictionSnapshot`, replacing them
with `routeCharacteristics` (distance, duration, segment/mode
composition) — everything a future evaluation actually needs to group
and compare predictions without knowing where someone travelled. This
does not touch the live, functioning routing system in any way —
`ResolvedLocation` still carries exact coordinates, as routing requires;
the transform only applies at the future evaluation-storage boundary.

### Development export

`exportSnapshotAsJson` (`lib/evaluation/devExport.ts`) formats a snapshot
as JSON for manual inspection/fixture creation, defaulting to the
redacted (`toStorableSnapshot`) shape. A defensive scan refuses to export
any object containing a field name matching `apikey|secret|token|
password|credential` — found and fixed one false positive during testing
(the field name `key` alone, used legitimately by `FactorContribution.key`,
would have matched a naive `/key/i` pattern). Surfaced in
`RiskPreview.tsx`'s existing expandable dev-detail panel as an "Export
prediction snapshot (dev, redacted)" button — not a prominent
user-facing feature.

### No database yet

Per this stage's explicit scope: no Postgres/Supabase/SQLite/Firebase,
no continuous background collection, no user-facing outcome survey. Only
types, serialization (`lib/evaluation/serialization.ts`), a
privacy-conscious storable transform, a reproducibility utility, and
test/dev fixtures exist. A real persistence choice is deliberately
deferred to a later stage.

### Future validation metrics (documented, not implemented)

The 0-100 V0 index is not a travel-time prediction or a probability, so
its eventual validation is about ranking and severity, not point
accuracy: Spearman rank correlation between index and observed
disruption severity; a confusion matrix / precision-recall if discrete
outcome categories are later defined; calibration only if/when outputs
are ever converted to probabilities (not planned); and all of the above
evaluated separately by mode, by forecast horizon (near-term / tomorrow /
48-72h), and by weather condition. None of this is implemented — it
requires real outcome data that doesn't exist yet (see `CommuteOutcome`
above) — this is a documented plan, not a claim of current validation.

## Expected commute duration model (V0)

See `docs/decisions/0010-duration-model-v0.md` for full rationale. This
section is the architecture: how the same factual layers that feed the
risk model also feed `lib/duration/`, and why the two outputs stay
independent.

### Risk vs. duration: two separate models, one shared input step

`ExperimentalCommuteRiskV0` answers "how disruption-prone does this
commute look" (a 0-100 severity score); `ExpectedCommuteDurationV0`
(`lib/duration/computeExpectedDuration.ts`) answers "how long should
this journey reasonably take" (a minute range). Both call the same
`buildCommuteFeatures` step (the identical factual weather/traffic/
transit/road-event aggregates feed both), but from there they diverge
completely — the risk model combines per-factor SEVERITY scores into an
index; the duration model performs TIMING arithmetic (baseline + factual
deltas + bounded heuristic ranges). Neither reads the other's output.
`computeExpectedDuration.test.ts`'s "independence from the risk model"
test proves this directly with a live counterexample: identical car
trips where heavy snow (high weather risk, small duration effect, since
weather is uncertainty-only for cars) produces a HIGHER risk index but a
SHORTER expected duration than a clear-weather trip with a real 8-minute
traffic delay.

### Baseline: unchanged, not redefined here

Every duration estimate starts from `Route.baselineDurationMinutes` (or
the sum of segment durations as a fallback) — the same baseline the rest
of the app already establishes. This model never asks the user for their
"normal" commute time and never recomputes what "baseline" means.

### DelayContribution: three deltas, not one number

Every contributor to the estimate (`lib/duration/types.ts`) carries
`centralMinutes`/`lowerMinutes`/`upperMinutes` — separate deltas against
the baseline — specifically so a contribution can widen uncertainty
WITHOUT shifting the central estimate. Per explicit instruction, most V0
weather/road-event/alert heuristics have `centralMinutes: 0` and only
widen the upper bound; only directly-measured evidence (Google traffic-
aware timing, TransLink realtime delay) shifts the central estimate. Each
contribution also carries `provenance` (`observed-provider` /
`scheduled-provider` / `derived` / `heuristic-v0`) — a Google traffic
delay is never presented as equivalent to a heuristic snow allowance.

### Car: traffic-aware duration as the central basis, not baseline + clamped delta

`buildCarContributions` (`lib/duration/carDuration.ts`) uses Google's
`trafficAwareDurationMinutes` for THIS request directly as the central-
estimate basis — `centralMinutes = trafficAwareDurationMinutes -
baseline`, which can be NEGATIVE. This is deliberate: it's what lets the
central estimate legitimately land below the static baseline when real
traffic is genuinely lighter than typical, confirmed live (SFU→Surrey:
baseline 28min, central estimate 24-26min across several real near-term
and future checks — genuinely faster, not an error). `directlyObservedDelayMinutes`
(the top-level summary field) is separately clamped to non-negative for
display, so this never renders as "-4 min delay" — see "No negative
commute" below. Road-event and traffic-condition (jam/slow) shares are
NEVER added as separate minutes on top of Google's own delay figure —
they already describe the congestion Google measured once; adding them
again would double-count it.

### Weather effect on car duration: near-term vs. future, to avoid double-counting

Near-term car trips already have Google's own traffic-aware measurement,
which itself reflects some real weather-driven slowdown — so near-term
weather widening (`config.car.nearTermWeatherUpperWideningMinutes`)
stays small and uncertainty-only. Far-future trips rely on Google's
historical/pattern estimate, which does NOT reflect a specific future
storm, so far-future weather widening
(`futureWeatherUpperWideningMinutes`) is larger. Verified live: identical
snow conditions produced roughly 3x more upper-bound widening for a
future-horizon car trip than a near-term one.

### Transit timeline propagation

`analyzeTransitTimeline` (`lib/duration/transitTimeline.ts`) walks a
route's real transit segments in order and:

1. Flags a CANCELLATION on any matched leg.
2. Detects a MISSED CONNECTION between two consecutive transit legs —
   checked ONLY when the earlier leg has realtime evidence (a
   schedule-only itinerary is trusted as internally consistent, since
   Google/TransLink planned it as joinable; only new realtime evidence
   can show a planned connection has actually broken).
3. Extracts the FINAL transit leg's own realtime arrival delay as the
   representative directly-observed delay for the trip (an intermediate
   leg's delay fully absorbed by transfer buffer doesn't change the
   trip's actual end time).

**Deliberately does not re-query GTFS static schedule data for a genuine
alternate itinerary** when a connection is missed or a trip is canceled
— the project brief explicitly allows "if the next departure cannot be
determined reliably, increase uncertainty... rather than inventing a
connection," and building a live schedule re-query would mean moving
duration computation server-side and adding a new GTFS-querying
capability, out of scope for this V0 stage. Instead, `predictionStatus`
becomes `"route-disrupted"` and a large, capped uncertainty widening
(`config.transit.disruptionUpperWideningMinutes`) is applied — honest
about not knowing the real gap, never inventing precision.

### Cancellations

Handled identically to a missed connection (above): `"route-disrupted"`,
wide uncertainty, no attempt at a specific alternate itinerary. Verified:
a canceled-vs-scheduled counterfactual test confirms the canceled case
never still shows the original precise scheduled duration/status.

### Walking and cycling: conservative, uncertainty-only weather effects

Per explicit instruction, V0 has no calibrated basis for an exact walking/
cycling speed reduction from weather. `buildWalkCycleContributions`
(`lib/duration/walkCycleDuration.ts`) sets `centralAdjustmentMinutes: 0`
for every condition (snow, freezing, heavy precipitation, severe wind,
official alert) — only the upper bound widens, scaled by the segment's
own baseline duration (a 5-minute walk and a 45-minute walk don't get the
same flat allowance) and capped per mode (`config.walk`/`config.cycle`).

### Road events

`buildRoadEventWidening` applies at the whole-route level regardless of
mode (a real event is physically real whichever way someone travels) —
uncertainty-only, keyed by the highest observed severity, since DriveBC
rarely provides a quantified delay figure to use directly.

### Range construction and "no negative commute"

`combineContributions` (`lib/duration/combine.ts`) sums each
contribution's three deltas against the baseline, then enforces the
range invariants unconditionally: `lowerBound >= 0`, `lowerBound <=
centralEstimate <= upperBound`. The clamp only floors the sum at 0 — it
never forces the central estimate upward, which is what allows it to
legitimately sit below the static baseline (see "Car," above). Only
`directlyObservedDelayMinutes` (the top-level DISPLAY summary) is
separately clamped non-negative, so a genuinely-faster-than-baseline trip
never renders as a negative "delay" while the underlying central-vs-baseline
relationship stays honest internally.

The range is intentionally allowed to be asymmetric — most V0 heuristic
effects only widen the UPPER bound (commute delays skew upward far more
than trips run dramatically early), so a symmetric `±5 min` band was
deliberately rejected as a fabricated precision this model doesn't have.

### Forecast horizon

`buildHorizonWidening` (`lib/duration/horizonWidening.ts`) adds a small,
capped, linearly-growing upper-bound allowance with how far out the trip
is — never a fabricated confidence percentage. Verified live: upper-bound
widening grew from ~0.1min (1 hour out) to ~2.4min (20 hours out) to
~8.5min (71 hours out) for the identical route.

### Duration prediction status

`DurationPredictionStatus` (`"available" | "limited-data" |
"insufficient-data" | "route-disrupted"`) has DIFFERENT sufficiency rules
than the risk model's — weather may be essential to a walking RISK score,
but baseline routing alone still gives a defensible duration estimate
without it (`lib/duration/sufficiency.ts`). The "primary timing evidence"
per mode is narrower: `drive` needs traffic; `bus`/`rail` need the
transit analysis to have succeeded at all (schedule-only is NORMAL, not
a degradation — the exact same "no update ≠ failure" principle as the
transit and risk stages); `walk`/`cycle` need nothing beyond the
baseline. `"route-disrupted"` overrides everything else once the
timeline detects a missed connection or cancellation.

### Duration data coverage — separate from risk coverage

`DurationDataCoverage` reuses the exact same per-source vocabulary as the
risk model's `DataCoverage` (same underlying `CommuteFeatureSet.dataCoverage`),
but duration's `predictionStatus` reasoning over it is independent, per
the different essentiality rules above.

### Deterministic explanation, no false precision

`buildDurationExplanation` (`lib/duration/explanation.ts`) emits one
sentence per contribution that actually has a non-zero effect, built
directly from that contribution's own values — no LLM, no randomized
prose. `lib/duration/format.ts` rounds every displayed value to whole
minutes (`"57–65 min"`, `"1 hr 02–1 hr 11 min"`) — the model's internal
values stay unrounded; only presentation rounds.

### Evaluation snapshot extension

`PredictionSnapshot` (`lib/evaluation/types.ts`) gained an OPTIONAL
`durationPrediction` field — additive, so an older snapshot (from before
the duration model existed) remains a fully valid `PredictionSnapshot`
with the field simply absent, no breaking schema version bump. The
duration model has its own `modelVersion`
(`"winterroute-duration-v0"`) and its own `configFingerprint`
(`lib/duration/configFingerprint.ts`, reusing the risk model's generic
stringify/hash helpers rather than duplicating them) — the two models
version and fingerprint completely independently, since a future change
to one's config shouldn't invalidate traceability for the other.
`toStorableSnapshot` (privacy transform) passes `durationPrediction`
through unchanged, since it carries no location data of any kind.

### Explicitly deferred within this stage (and why)

- **No expected-commute-time-based recommended departure.** This stage
  validates expected-duration behavior first, per the project brief's
  own explicit sequencing.
- **No live GTFS re-query for a genuine alternate itinerary** after a
  missed connection/cancellation — see "Transit timeline propagation"
  above.
- **No database, no ML, no final results UI, no map, no dynamic weather
  animation.**

## Recommended departure / expected arrival model (V0)

See `docs/decisions/0011-timing-recommendation-v0.md` for full rationale.
`lib/timing/` converts `ExpectedCommuteDurationV0` into an action —
"leave by X" for Arrive By, "expect to arrive Y-Z" for Leave At — with
its own independent model version (`"winterroute-timing-v0"`) and config
fingerprint, since its decision rules (the conservative cap, missed-
window handling) may evolve separately from duration-v0's timing
arithmetic.

### Why the risk index cannot affect timing

`computeTimingRecommendation`'s signature accepts a duration prediction,
a preference, a target time, and `now` — there is no risk-score
parameter anywhere in the call chain, so it is structurally impossible
for the risk index to influence a timing recommendation, not merely
policy-forbidden. `computeTimingRecommendation.test.ts`'s "independence
from the risk index" test proves this with a live example: two
wildly different risk indices computed for the same route (clear weather
vs. severe snow) alongside the identical duration fixture produce
byte-identical timing output.

### Arrive By: `target - upperBound`, capped at typical

```
rawRecommended   = target - expectedUpperBound
typicalDeparture = target - baselineDuration
recommended      = min(rawRecommended, typicalDeparture)   // conservative cap
```

The UPPER bound is used deliberately — it already contains factual
traffic/realtime effects, modeled uncertainty, forecast-horizon
widening, weather uncertainty, and road-event uncertainty (see the
duration-model stage). Adding a further arbitrary 10-15 minute safety
buffer on top would double-count uncertainty the duration model already
accounted for.

### The conservative typical-departure cap

`recommended` is never later than `typicalDeparture`, even when the
duration model's upper bound is genuinely faster than baseline (a real,
confirmed case). WinterRoute may recommend the same time as typical, or
earlier, but V0 deliberately never recommends leaving LATER than typical
purely because current conditions look unusually light — conditions can
change between the recommendation and the actual trip, and "traffic is
light right now, leave later" is exactly the kind of advice that ages
badly. Verified live (Vancouver→Burnaby, real traffic genuinely 5-7min
faster than baseline): the recommendation capped at the typical
departure time with `leaveEarlierByMinutes: 0` and the message "Your
usual departure timing should be sufficient," never a later-than-typical
suggestion.

### Rounding

`recommendedDepartureTime`/`typicalDepartureTime` are floored to the
minute (`lib/timing/roundTime.ts`) — rounding UP would push the
recommendation into an unsafe later minute, silently eroding the "leave
by" guarantee. Expected-arrival times use ordinary nearest-minute
rounding, since there's no equivalent directional safety concern for an
informational arrival estimate.

### Leave At: an arrival range, never a second-guessed departure

```
expectedArrivalLower   = departure + durationLowerBound
expectedArrivalCentral = departure + durationCentral
expectedArrivalUpper   = departure + durationUpperBound
```

No recommendation, no cap, no missed-window concept — a user-selected
Leave At time is a planning input, not an arrival deadline WinterRoute
can second-guess. `typicalArrivalTime` (`departure + baseline`) is
computed only for the "typical vs. expected" comparison, never displayed
as a recommendation.

### Missed departure window (Arrive By only)

`recommendedDepartureTime.getTime() < flooredNow.getTime()` — strict
`<`, not `<=`, the same minute-flooring discipline established (and
regression-tested) since the trip-validation stage: a recommendation
landing EXACTLY on the current minute is still actionable, not missed.
When missed, status becomes `"departure-window-missed"` and no
"leave by X" is shown as actionable. Verified live: a genuine real-world
SFU→Surrey transit trip (90 min away, 90-110 min actual journey) hit
this state naturally during testing — the recommended departure had
already passed by the time of computation, and the preview correctly
showed the missed-window message instead of a stale "leave by" time.

### Leave-now fallback, and when it's withheld

On a missed window, an informational `leaveNowExpectedArrivalRange`
(`now + durationBounds`) is computed — but ONLY when
`ExpectedCommuteDurationV0.analyzedAt` is recent enough (within
`config.staleAnalysisToleranceMinutes`, 15 min) relative to `now`.
Beyond that, the traffic-aware/realtime evidence embedded in the
original analysis may no longer reflect current conditions, and
WinterRoute refuses to reuse it — `leaveNowAnalysisStale: true` is set
instead, with no fabricated arrival range. This is a deliberately
conservative, documented limitation: WinterRoute cannot re-fetch live
provider data from this pure function, so "stale beyond a threshold"
is the honest signal, not a live recheck.

### Status propagation

`TimingRecommendationStatus` propagates from
`ExpectedCommuteDurationV0.predictionStatus` with one addition:
`insufficient-data`/`route-disrupted` short-circuit before any departure
math is attempted (no fabricated recommendation from a duration the
model itself couldn't defend); `limited-data` still produces a
recommendation (the duration range itself is usable), flagged as based
on incomplete data; `departure-window-missed` (Arrive By only) takes
priority in the reported `status` over `limited-data`/`available` once
detected, while the underlying data-quality reason is still preserved in
`statusReasons` — confirmed live, both states co-occurred naturally in
one real test run (a near-current car trip with transiently unavailable
traffic data AND an already-passed recommended departure).

### Timezone and DST handling

All arithmetic is absolute epoch-millisecond math on `Date` objects
(`lib/timing/roundTime.ts`) — never naive clock-string manipulation. This
is what makes midnight crossings and DST transitions correct "for free":
an absolute instant plus or minus N minutes is the same real moment
regardless of what calendar date or UTC offset it lands on. Tested
explicitly (spring-forward, fall-back, and a recommended departure
landing on the previous calendar day for a post-midnight arrival target)
specifically to prove this, not merely assumed.

### Deterministic explanation

`lib/timing/explanation.ts` builds sentences directly from
`ExpectedCommuteDurationV0`'s own baseline/range values and — for the
"why earlier" reasoning — reuses the dominant duration contribution's
OWN already-written explanation text (by largest upper-bound effect)
rather than re-deriving new wording, so the timing and duration previews
never disagree about why. Never reads the risk index or its
contributions.

### Evaluation snapshot extension

`PredictionSnapshot` gained an OPTIONAL `timingRecommendation` field —
same additive, non-breaking pattern as the duration extension. Building
this surfaced a real serialization bug: `timingRecommendation`'s Date
fields (`targetOrDepartureTime`, `recommendedDepartureTime`,
`expectedArrivalWindow.*`) need explicit ISO-string/Date revival in
`lib/evaluation/serialization.ts`, the same as every other nested Date in
the snapshot — an initial version relied on the generic object spread,
which is exactly the kind of subtle bug the module's own round-trip
tests exist to catch, and did.

### Explicitly deferred within this stage (and why)

- **No map, no dynamic weather animation.** See "Final results
  experience (Phase 1)" below for how the layout was built to accept
  both without a rewrite.
- **No live re-fetch for the "leave now" fallback.** See "Leave-now
  fallback" above.
- **No user-selectable safety-buffer presets** (Conservative/Balanced/
  Aggressive) — V0 has one understandable rule; personalization is
  future work.

## Final results experience (Phase 1)

Once the Route/Weather/Traffic/Transit/Risk/Duration/Timing models were
each independently validated as their own development-preview stack
(prior stages), that stack was consolidated into a single, hierarchical
results screen — presentation-only: no domain/model logic changed,
moved, or re-derived. `components/results/*` are pure consumers of
already-computed domain objects passed as props; the old
`components/trip/*Preview.tsx` components are untouched and still do
the actual async fetch + state management in `TripForm.tsx`.

### Component shape

- `TripForm.tsx` gained a three-way view mode, derived from existing
  state rather than a new state variable: **form** (`routeState` is
  `null` or `"error"`), **loading** (`routeState` succeeded but
  `riskState` hasn't been set yet), **results** (`riskState` — and
  therefore `durationState`/`timingState`, set synchronously alongside
  it — is non-null). `handleSubmit`'s domain-computation logic is
  byte-for-byte unchanged; only the render branch at the bottom of the
  component changed.
- `ResultsView` composes `TripHeader` → `TimingHero` (the hero result)
  → `JourneyDuration` + `RiskSummary` → `RouteConditions` → map +
  itinerary → `WhySection` → `DataCoverageBadge` → `DetailsDrawer`,
  matching the required 3-second information hierarchy top to bottom.
  The map+itinerary row's layout is conditional on the route actually
  having a multi-step itinerary worth side-by-side width — see "Map
  layout: landscape-dominant, conditional on route shape" below; mobile
  is always a single stacked column in the same document order.
- `ConditionsSummary` hides a whole category (Traffic/Transit) rather
  than rendering an empty/"Not applicable" card, based on the route's
  actual segment modes (`route.segments.some(s => s.mode === "drive")`,
  etc.) — a walking-only route never shows a Traffic or Transit card.
- `DataCoverageBadge` derives "Good"/"Limited data" purely from
  existing preview-state statuses (loading/error/success + the
  domain-level status field) — never a fabricated percentage. A
  future trip with a matched schedule but no realtime data yet is
  explicitly coded as normal coverage, not a limitation.
- `DetailsDrawer` always renders required attribution (Google,
  Open-Meteo, ECCC/ECMWF/NOAA, DriveBC/Open511, TransLink's exact
  required wording via `TRANSLINK_ATTRIBUTION_TEXT`) regardless of
  environment. It additionally renders the original, unmodified
  `RoutePreview`/`WeatherPreview`/`TrafficPreview`/`TransitPreview`/
  `RiskPreview`/`DurationPreview`/`TimingPreview` components — full
  diagnostic capability, not deleted, just relocated — inside a nested
  sub-section gated on `process.env.NODE_ENV === "development"`, so
  config fingerprints, raw feature values, and GTFS IDs never ship to
  production.
- `LoadingSequence` cycles truthful staged text tied to which real
  async state (`routeState`/`weatherState`/`trafficState`/
  `transitState`) is actually still `"loading"` — never a fabricated
  progress percentage — and reads `prefers-reduced-motion` via a lazy
  `useState` initializer (not a same-tick `setState` inside `useEffect`,
  which `eslint-plugin-react-hooks`'s `set-state-in-effect` rule flags
  as a cascading-render risk) so the spinner respects the preference
  without an extra render.

### Weather-scene-ready and map-ready, without building either

`ResultsView` and the page shell were deliberately kept decoupled from
`.atmosphere-bg`'s specific static gradient — no result component reads
or depends on it — so a future dynamic weather background can replace
it without touching `components/results/`. No map placeholder box was
added; when a map is built, it has a natural home as an additional
column/section in `ResultsView`'s existing responsive grid rather than
requiring a layout rewrite.

### Page width: conditional, not fixed

`page.tsx` no longer owns a `max-w-md` wrapper — `TripForm.tsx` does,
conditionally: `max-w-md` for the form and loading views, `max-w-5xl`
for results, since a two-column results layout in a phone-width column
would defeat its own purpose.

### Testing

`vitest.config.mts`'s `include` was `["src/**/*.test.ts"]` — a pattern
that silently excluded every `*.test.tsx` file, including the
pre-existing `LocationAutocomplete.test.tsx`, which had never actually
been run by `vitest run`/`npm test`. This is a pre-existing test-infra
gap, not something introduced by this stage, and is called out here
rather than fixed silently: it was corrected to
`["src/**/*.test.ts", "src/**/*.test.tsx"]` so that component tests
(the new `components/results/*.test.tsx` files and the existing one)
actually execute. `@testing-library/jest-dom` is not installed, so
these tests use plain Vitest/DOM assertions (`toBeTruthy()`,
`container.textContent`) rather than `toBeInTheDocument()`, consistent
with the one pre-existing component test's style.

`components/results/fixtures.ts` re-exports `lib/scoring/fixtures.ts`'s
Route/Weather/Traffic/Transit builders and adds minimal Risk/Duration/
Timing fixtures, following the project's established per-layer
`fixtures.ts` convention (`lib/scoring/fixtures.ts`,
`lib/timing/fixtures.ts`, `lib/evaluation/fixtures.ts`).

## Map visualization architecture

See `docs/decisions/0012-route-map-and-weather-scene.md` for the full
rationale behind every decision summarized here.

### Google key separation

Two keys, two trust boundaries, never read from the same code path:

- `GOOGLE_MAPS_API_KEY` — server-only, `lib/google/*` (Places/Routes).
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` — public, read ONLY by
  `components/map/googleMapsLoader.ts`, restricted at the Google Cloud
  Console level to HTTP-referrer + Maps JavaScript API only.
- `NEXT_PUBLIC_GOOGLE_MAP_ID` — the configured Map ID, required for
  Advanced Markers and passed to `new Map(el, { mapId })`. No `styles`
  array is passed alongside it — a Map ID's styling is configured in
  Cloud Console, not overridden at runtime; a not-yet-customized Map ID
  simply renders Google's default style, and the surrounding card/
  container stays visually cohesive regardless.

Verified directly against a production `next build` output: the server
key does not appear in any `.next/static/**/*.js` chunk; the browser
key does (as intended — it's meant to be public, protected by referrer/
API restrictions instead of secrecy).

### Loading strategy

`components/map/googleMapsLoader.ts` implements the current documented
"dynamic library import" approach (a base script exposing
`google.maps.importLibrary`, individual libraries fetched on demand) —
written out longhand rather than pasting Google's minified bootstrap
snippet, for type-safety and readability, with equivalent behavior. The
script is injected at most once per page (a cached module-level
promise shared across every mount, including React 19 dev-mode's
double-invoked effects). `RouteMap` calls `importLibrary("maps")` (for
`Map`/`Polyline`), `importLibrary("marker")` (for
`AdvancedMarkerElement`), and `importLibrary("core")` (for
`LatLngBounds`) — only the libraries actually used.

### Rendering existing route data — no new routing request

`RouteMap` (`components/map/RouteMap.tsx`) visualizes the ALREADY-
COMPUTED `Route` object — specifically `RouteSegment.geometry` (the
real road-following path from the ORIGINAL `computeRoute` call) — and
never issues a Directions/Routes request from the browser. A segment
missing geometry falls back to a straight start-to-end line rather than
being dropped; a route with no geometry anywhere falls back to fitting
origin/destination bounds only. Google-specific browser code (`google.
maps.*`) lives entirely in `components/map/` — the rest of the app only
ever passes a plain `Route` in.

### Mode styling and the traffic-coloring limitation

`routeMapGeometry.ts`'s `styleForMode` gives each `SegmentTransportMode`
a restrained, WinterRoute-specific treatment (walk/cycle dashed and
lighter; bus/drive share the WinterRoute blue; rail its own hue) — never
a "rainbow route." **Traffic-interval coloring (NORMAL/SLOW/TRAFFIC_JAM
per drive section) is intentionally NOT implemented**: `TrafficInterval`
indices reference a polyline from a separate traffic-aware Google
request that is never preserved past `lib/traffic/transform.ts`, and
that request isn't guaranteed to follow the identical path as the
original route's geometry. Per the explicit "never fake traffic
location" instruction, drive segments render in one consistent color;
the real NORMAL/SLOW/TRAFFIC_JAM proportions remain exactly where they
already lived — `ConditionsSummary`'s traffic card. Transit routes never
borrow car traffic-jam coloring. Transit stop markers are omitted in V1
(only origin/destination markers) — a deliberate scope decision, not an
oversight.

### Fallback behavior

Any failure — missing `NEXT_PUBLIC_GOOGLE_MAP_ID`, the script failing
to load, an unexpected exception during setup — resolves to a
`"Route map unavailable"` state, never an unhandled error. `ResultsView`
never depends on the map for timing/duration/disruption/weather/
traffic/transit content, verified by a dedicated test asserting all of
that still renders when the map can't.

## Weather scene architecture

See `docs/decisions/0012-route-map-and-weather-scene.md` for the
scene-resolution algorithm's full rationale, including how each
required disagreement example resolves.

### Domain: `WeatherSceneDescriptor`

`lib/weatherScene/types.ts` defines a presentation-only descriptor
(`condition`, `intensity`, `dayPhase`, `precipitationType`,
`cloudiness`, `windLevel`, `sky`, `lightning`, `selectedTripTime`,
`dataStatus`, `derivationNotes`) — deliberately outside `lib/scoring/`'s
`CommuteFeatureSet` and every other analytical type. A dedicated test
(`noModelSideEffects.test.ts`) proves resolving several different
weather scenes between computing risk/duration/timing leaves their
output byte-identical, and that `resolveWeatherScene` never mutates the
`RouteWeatherAnalysis` it's given.

### Compositional fields: `sky` and `lightning`

Rather than a second, parallel "`WeatherVisualScene`" type, the SAME
descriptor gained two fields so every renderer (background, particles,
lightning, sun/moon, icon) reads from one shared source of truth and can
never disagree with another:

- **`sky`** (`"clear" | "mainly-clear" | "partly-cloudy" | "overcast" |
  "foggy"`) — `skyFor()` in `resolveWeatherScene.ts`. Any genuinely
  precipitating or stormy `condition` always resolves to `"overcast"`
  (this app never renders a sun-shower); fog is its own value, never
  folded into "overcast"; `"mainly-clear"` (WMO code 1) is distinguished
  from `"clear"` (code 0) by checking whether any contributing forecast
  actually reported code 1.
- **`lightning`** (`boolean`) — `true` exactly when `condition ===
  "thunderstorm"`, but critically INDEPENDENT of `precipitationType`.
  `precipitationTypeFor()` was fixed so a thunderstorm's precipitation
  reflects the ACTUAL measured `maxPrecipitationMm`/`maxSnowfallCm`
  rather than being hardcoded to `"rain"` — this is what makes a genuine
  DRY thunderstorm (lightning, no rain particles) representable at all,
  rather than every thunderstorm always implying rain.

`sunVisibility.ts`'s `isSunVisible`/`isMoonVisible` are pure functions
of `sky`+`dayPhase` alone (see rules below) — no separate precipitation
check needed, since `sky` already encodes "is there open sky right now."

### Sun/moon visibility rules

Deterministic, in `components/weatherScene/sunVisibility.ts`:

| `sky`           | Day            | Night           |
|-----------------|----------------|-----------------|
| clear           | sun visible    | moon visible    |
| mainly-clear    | sun visible    | moon visible    |
| partly-cloudy   | sun visible*   | moon visible    |
| overcast        | never          | never           |
| foggy           | never          | never           |

\* Partly-cloudy day: the sun disc renders, but the drifting NEAR cloud
layer (see below) is positioned across the same coordinates, so it
periodically passes in front of it — simulated via z-order and drift
timing, never real physics. Night never shows a sun regardless of sky;
overcast/foggy never shows a moon (never visible through thick cloud or
haze) — this is also why "cloudy night" never shows stars: the star
dots baked into `.scene-clear-night`'s CSS only exist on the CLEAR
night gradient, never the cloudy/overcast one.

### Resolution: selected commute time, multi-model consensus

`resolveWeatherScene(analysis, originForDayPhase)` uses the SELECTED
commute's own `RouteWeatherAnalysis` — never the viewer's current
weather — mapping each forecast's WMO `weatherCode` (same code table as
`lib/weather/weatherCodes.ts`) to one of 13 scene conditions. Each
independent model casts one vote (its own worst-case condition
anywhere along the route); a majority wins; disagreement without a
majority falls back to a defensible sky-only consensus, never a
minority precipitation signal. A precipitation vote with no measurable
mm/cm behind it is demoted to cloudy. Official ECCC alerts can only
intensify an already-supported condition (e.g. snow -> heavy-snow),
never invent one; `alertStatus === "unavailable"` is recorded, never
silently treated as "confirmed no alert." Missing/empty analysis
resolves to `dataStatus: "unavailable"` and condition `"unknown"` — the
renderer treats that as the neutral scene, never a guessed "clear."

### Day/night: solar elevation, not the viewer's clock

`lib/weatherScene/dayPhase.ts` computes real solar elevation from the
route origin's latitude/longitude and the selected commute `Date`
(declination + equation-of-time + hour angle) — no `is_day` provider
field, no hardcoded UTC offset, no timezone database. This keeps a
future daytime trip visually "day" even when checked at night, and vice
versa (tested directly, including a midnight-crossing case), and avoids
needing to pick which of three independent models' `is_day` to trust
for a value that's pure astronomy, not a model disagreement.

### Rendering (V2): a full renderer rewrite, not a tuning pass

The FIRST cloud rendering pass (semi-transparent radial-gradient blob
stacks, a fixed 8-bucket CSS palette) turned out not to meet the bar
after manual inspection — clouds read as "faint silver blobs," rain/
snow intensities were barely distinguishable from each other, and the
sun looked like a lit 3D sphere. Rather than keep tuning opacity
numbers on that architecture, the RENDERER was rebuilt from the ground
up (see `docs/decisions/0014-weather-visual-renderer-rebuild.md` for
the full rationale). The `WeatherSceneDescriptor` DATA contract
(`condition`/`intensity`/`sky`/`precipitationType`/`lightning`/
`dayPhase`/`dataStatus`) is completely unchanged — only how it gets
turned into pixels changed.

**`weatherVisualProfile.ts` — the single visual-profile matrix.**
`visualProfileFor(condition, intensity, sky, precipitationType,
lightning, dayPhase)` is now the ONE place every render surface reads
its parameters from: sky gradient colors, cloud layer recipes,
precipitation particle profile, ambient haze, fog band count, sun/moon
visibility, lightning. Keyed primarily on `condition` (which already
distinguishes drizzle/rain/heavy-rain/freezing-rain/snow/heavy-snow/
thunderstorm as separate values) with `intensity` selecting a sub-tier
WITHIN a condition family (so "Light Rain" and "Heavy Rain" — both
`condition: "rain"`-adjacent — get visibly different profiles), `sky`
distinguishing "Snow Showers" from ordinary snow, and
`precipitationType`+`lightning` distinguishing a dry thunderstorm from
a wet one. `weatherVisualProfile.test.ts` directly proves the
"visual acceptance rule" the redesign was built around: cloud density
strictly escalates clear < mainly-clear < partly-cloudy < overcast <=
storm; rain density/streak-length/speed/haze strictly escalate drizzle
< light < moderate < heavy; snow density/haze/flake-size strictly
escalate light < moderate < heavy; freezing precipitation uses a
different palette and an `icy` flag ordinary rain never sets; all three
thunderstorm variants (dry, +light rain, +heavy rain) resolve to
distinct profile ids; and none of the 21 required Scene Lab presets
share an identical profile.

**Cloud shape — procedural SVG, not CSS gradients (V3).** `cloudShapes.ts`
generates a cloud mass as several overlapping, fully OPAQUE IRREGULAR
BLOB PATHS (`blobPath`) — each blob's outline is a smoothly-interpolated
closed curve (Catmull-Rom through Bezier, `smoothClosedPath`) through
points at a RANDOMIZED radius around its center, never a fixed-radius
circle or ellipse — sharing one top-to-bottom gradient fill; same-fill
opaque shapes blend into one seamless silhouette. Rendered as a
`data:image/svg+xml` background-image, softened at the edge by a
`feGaussianBlur`. Two earlier passes tried "faint translucent blobs"
then "flattened, rotated ellipses" — both still read as recognizable
primitives (circles/ovals) chained together, since an ellipse always
has smooth, symmetric curvature. A blob's per-point radius is randomized
independently at 9-12 angles around its center (never the same twice),
which is what actually removes the "row of circles" read: no individual
shape has ellipse-like symmetry, so several heavily-overlapping blobs
fuse into one continuous, asymmetric mass rather than a chain of
identifiable objects — verified by a test computing each blob's point-
to-center distances and asserting real variance (a true circle/ellipse
would have none). `organicCloudCluster` combines 4-7 such blobs per
cloud mass at varied size/offset/rotation. A small seeded PRNG
(`seedFromString` + mulberry32) makes each layer's cluster arrangement
deterministic per `(profile id, layer key)` — stable across renders,
but genuinely different-LOOKING between conditions AND between a single
condition's far/mid/near layers (verified directly), not the same
shapes recolored/rescaled. Rendered through the SAME
`.weather-cloud-layer` CSS (`background-repeat: repeat-x` + an animated
`background-position-x`) as before — only the `backgroundImage` VALUE
changed.

**The rectangular-clipping artifact and its fix.** A visible straight-
edged rectangle inside the cloud layer was traced to the SVG tile's own
viewBox: the V2 ellipse generator's "fringe" lobes used an unbounded
offset formula (`dist * 1.35`, where `dist` itself scaled with `scale`,
which for a "near" layer at heavy-snow/storm intensity could reach ~50)
— worst case, a fringe lobe's center could land ~130 units from its
cluster's own base position, comfortably exceeding the 300-unit-wide
viewBox. Content (and its blur) extending past an SVG's own viewBox
gets hard-clipped exactly at that boundary; because the tile then tiles/
stretches via CSS `background-repeat`/`background-size`, that clip
showed up as a repeating straight-edged rectangle. Fixed at the
geometry level, not by hiding it: every blob's SIZE and OFFSET are now
bounded as a fraction of the tile's own `width`/`height` (never purely
of the caller's `scale`, so an unusually large `scale` for a denser
condition can no longer push shapes toward the edge), AND every
resulting coordinate — including the Bezier CONTROL points, which can
overshoot slightly past their on-curve neighbors by construction — is
hard-clamped to stay `EDGE_SAFE_MARGIN` (26 units) inside the tile
bounds. The tile itself was also enlarged (300x120 -> 420x170) for more
inherent room, the SVG `<filter>` region was made generous (-60%/220%,
up from -20%/140%), and the root `<svg>` declares `overflow="visible"`
as a second, independent defense. The clamping is the actual guarantee
(verified directly): a test decodes the generated path data across 25
different seeds at the largest scale/cluster-count combination any real
condition ever produces, and asserts every coordinate — including
control points — stays inside the safe margin.

**Layer count and escalation.** Clear: 0. Mainly-clear: 1 very sparse
wisp. Partly-cloudy: 2 (far+near, positioned across the sun's fixed
coordinates so the drifting near layer visibly passes in front of it).
Overcast/every precipitating condition/thunderstorm: 3 (far/mid/near),
with layer scale/fill-alpha/count also scaling up with `intensity`
within the rain/snow families (so heavy rain's clouds are themselves
denser than light rain's, not just its particles). Fog: 0 ordinary
cloud layers, but its own `fogBandCount` of layered horizontal mist
bands (`.weather-fog-band` — a blurred horizontal light streak per
band, staggered vertical offset/opacity/drift-duration, each
animating a slow side-to-side `translateX` — "mist passing through the
scene," never a flat white overlay).

**Sun/moon — concentric bloom + core, never an off-center highlight.**
The previous sun used an off-center radial-gradient highlight (`circle
at 35% 32%`), which is exactly what makes a sphere read as 3D-lit —
i.e. a planet. The rebuilt sun/moon are each TWO layers sharing the
exact same CENTER (`.weather-scene-sun-bloom`/`-core`,
`.weather-scene-moon-bloom`/`-core`): a large, heavily-blurred
"bloom" (atmospheric diffusion) behind a smaller, nearly-blown-out
"core" (concentric `radial-gradient(circle, ...)`, no off-axis
highlight) — reads as atmospheric sunlight/moonlight, not an object.
Both render at a single fixed screen position
(`CELESTIAL_POSITION`) — a distant object doesn't need to move per
condition. `sunVisibility.ts`'s `isSunVisible`/`isMoonVisible` remain
the SOLE source of truth for whether either renders; `weatherVisualProfile.ts`
calls them directly (never re-derives the same rule inline) for every
condition branch, so there is exactly one place "should a celestial
body show right now" is decided.

**Stacking/z-index — made explicit, verified, not just assumed
correct.** `.weather-scene-layer` (sky/stars/sun-moon/clouds/fog/haze):
`z-index: 0`. Particles, the lightning flash/bolt, and the scrim:
`z-index: 1`. `.weather-scene-content` (the actual results UI): `z-index:
2`. Because `.weather-scene`'s `isolation: isolate` makes this ONE
stacking context and every weather-visual element lives in a document-
order-earlier sibling of `.weather-scene-content` with a STRICTLY LOWER
z-index, no card, backdrop-blur, or filter on the content side can ever
cause a sun/moon/cloud to paint above it — verified directly (not just
asserted) by rendering a scene with the sun visible and asserting its
DOM position precedes `.weather-scene-content` in every layer. A sun/
moon may still show softly through a card's own translucent/blurred
background (intentional — "sits behind translucent glass," never
"embedded inside a card," since it is never a descendant of the card's
own DOM subtree).

**Particles — parameterized entirely by the resolved `PrecipitationVisual`.**
`WeatherParticles.tsx` now takes a `PrecipitationVisual | null` prop
directly (from `profile.precipitation`) rather than re-deriving density/
size/speed from `precipitationType`+`intensity` itself. `particleSystem.ts`
samples each particle's speed/length/opacity from the profile's own
`[min,max]` ranges, with depth (`far`/`mid`/`near`) selecting WHICH
PART of that range a given particle samples from (far = low end, near
= high end) — so "near is bigger/brighter than far" holds within every
intensity tier, while a heavier tier's whole range still sits higher
than a lighter one's. `particleCountFor(density)` scales the particle
count directly off the profile's 0-1 density value (drizzle ~0.2,
heavy rain 1.0 of the 190-particle cap — raised from 150 in a second
pass specifically so snow had more headroom) — a materially different
count between tiers, not a curve flattened near a shared ceiling.
Freezing precipitation's `icy: true` flag switches the canvas draw
color to a visibly colder, brighter cyan-white (`ICY_RAIN_COLOR`)
instead of ordinary rain's slate-blue — "icy glints," not a recolored
rain layer. Renders nothing (`profile.precipitation === null`) for
clear/cloudy/fog, and for a genuine DRY thunderstorm.

Snow specifically was re-tuned a full tier up after inspection showed
light snow reading as "maybe two flakes if you squint": light snow's
density/opacity/haze all moved up (0.25 -> 0.42 density, 0.35-0.55 ->
0.5-0.74 opacity) while STAYING the gentlest of the three tiers; heavy
snow moved up proportionally further (density stays at the 1.0 cap, but
the cap itself is now 190 particles instead of 150, and its own
opacity/length/haze ranges were raised too) so the light-to-heavy
ladder stays sensible while every rung is now clearly visible —
verified directly by a test asserting light snow's particle count and
opacity floor meet an explicit "unmistakably visible" minimum, and that
heavy snow's particle count is more than double light's.

**Lightning — illumination plus an optional visible bolt.** The
existing full-scene `.weather-scene-lightning` flash (soft illumination
"behind/within" the cloud layers) is now paired with an OPTIONAL
procedurally-jagged bolt (`lightningBolt.ts` — a fresh random zigzag
path, sometimes with a short branch, generated fresh at each flash
trigger) rendered as a small glowing SVG path at a random horizontal
position, visible only for the same ~260ms window. Both stay keyed on
`profile.lightning` (not `condition === "thunderstorm"` directly) and
both are disabled entirely under `prefers-reduced-motion`, for both wet
and dry storms — irregular 6-14s intervals, never rapid/predictable
strobing.

**Palette — generated inline per profile, not 8 fixed CSS classes.**
The base sky gradient (`.weather-scene-sky`'s `background`) is now an
inline `linear-gradient(...)` built directly from `profile.skyTop`/
`profile.skyBottom` — every condition/intensity tier gets its OWN two
hand-chosen colors (drizzle/light-rain/moderate-rain/heavy-rain/
freezing-drizzle/freezing-rain/light-snow/moderate-snow/heavy-snow/
snow-showers/storm each distinct) rather than sharing one of 8 coarse
buckets. Night palettes for the four sky-only conditions (clear/
mainly-clear/partly-cloudy/overcast) are hand-authored navy/indigo
tones, not a brightness-darkened copy of the day palette ("night
should feel naturally darker, not just same scene + dark filter");
precipitating conditions' night variants use `nightVariant()`, which
darkens AND blue-shifts toward navy (not a flat multiply) for the same
reason. A constant, condition-independent `.weather-scene-vignette`
(soft radial edge darkening) adds depth without any per-condition
tuning.

**Stars — three tiers, never boolean on/off.** `profile.starDots` is
`"none" | "sparse" | "full"`. "full" (nine dots, `.weather-scene-stars`)
renders only for clear/mainly-clear night; "sparse" (four dots, lower
opacity, `.is-sparse`) renders for partly-cloudy night — a few stars
still visible through the gaps, never the full field; "none" for every
other condition, including overcast/foggy night (never visible through
thick cloud/haze, matching `isMoonVisible`'s own rule). Both tiers get
a slow (7s/9s), low-amplitude whole-layer opacity pulse for a subtle
twinkle — never per-star flicker, which would read as noisy pixels —
disabled under `prefers-reduced-motion` (falls back to a static
opacity per tier, never fully off).

### Full-site text readability

After a second inspection pass, low text contrast over bright/pale
scenes (clear day, light snow, fog) was traced to two causes, both
fixed without any new scene-aware branching logic (a uniform,
condition-independent floor, not per-scene special-casing):

- **`.weather-scene-scrim`'s middle band was nearly undarkened**
  (0.04-0.08 opacity across the 28%-65% range) — exactly where almost
  every result card actually sits. Raised to a real, uniform floor
  (0.16-0.2) across that whole band, with the top/bottom edges raised
  to match.
- **Several "bare" elements** (`TripHeader`'s origin→destination line,
  the `CommutePreviewControls` button row) have no card behind them at
  all, sitting directly over the scene — these got a genuine background
  fill (not just a border) on every button, plus a subtle
  `text-shadow` on the trip-header heading/subtitle text specifically
  BECAUSE nothing else darkens behind it.

On top of that, the low-opacity "muted" text tokens used throughout
`components/results/` (`text-white/30` through `text-white/50`, used
for eyebrow labels, timestamps, detail lines, source attribution) were
raised by a consistent notch (e.g. `/40` -> `/55`, `/50` -> `/62`) —
enough to establish a real contrast floor without flattening the
existing hierarchy (primary numbers/values stayed at their own, already
-higher opacity). Card backgrounds/borders across `ResultsView`,
`RouteConditions`, `TripItinerary`, `RouteNote`, `DetailsDrawer`, and
`RouteMap`'s error state were bumped a similar notch (e.g.
`bg-white/[0.05]` -> `bg-white/[0.08]`, `border-white/10` ->
`border-white/15`) for the same reason. None of this is conditional on
the actual resolved scene — it is a uniform floor that holds regardless
of which condition is showing, which is what keeps it simple and
testable (a few `className`-presence tests, e.g. confirming the trip-
header heading carries a `text-shadow` utility and the preview
controls' buttons carry a real background fill) rather than requiring
per-scene visual QA.

The crossfade mechanism itself (one/two `.weather-scene-layer`
wrappers, opacity-only transition, added during RENDER via React's
"adjusting state when a prop changes" pattern) is UNCHANGED from the
previous stage — only what a layer now contains (a full
`WeatherVisualProfile`, rather than a CSS class name) changed.

### Weather icon: same descriptor, never independently derived

`lib/weatherScene/icon.ts`'s `deriveWeatherIconKind(sky,
precipitationType, lightning, dayPhase)` is a pure function consuming
the SAME four fields the background/sun-visibility logic reads —
lightning always wins (storm/storm-rain), then precipitation (rain-
cloud/snow), then sky (fog/cloud/sun-cloud/moon-cloud), then a bare
sun/moon for clear skies; a sun/moon is only ever chosen when
`sunVisibility.ts` would also show one for that combination, so the
icon can never show a sun over what the background renders as
overcast. `components/weatherScene/WeatherIcon.tsx` renders small,
original single-color inline SVG shapes (never a copy of any platform's
glyph set) from the derived kind. `buildRouteConditions.ts` calls
`resolveWeatherScene` a second time (a cheap pure re-derivation, like
the sky-condition text already did — never a second provider request)
to attach an `icon` to the dominant weather `RouteConditionItem`,
rendered next to its title in `RouteConditions.tsx`.

### Reduced motion, readability, and the neutral fallback

`prefers-reduced-motion: reduce` disables the crossfade transition, all
cloud-layer drift and glow pulsing, the particle canvas, and lightning
flashes entirely — the resolved condition still reads through the
static sky gradient (and, for fog, its haze) alone, so the scene never
loses its meaning, only its motion. A constant, condition-independent
`.weather-scene-scrim` (a soft top/bottom-weighted dark gradient) sits
above every atmosphere layer and below the content, guaranteeing a
readability floor regardless of how bright or busy a given scene gets
— rather than tuning contrast per condition. Result cards additionally
got a modest `backdrop-blur-md` + slightly raised opacity bump (not
applied everywhere) so they read as sitting over the scene without
turning the interface into glassmorphism. The form and loading views
keep the original static `.atmosphere-bg` (byte-identical gradient to
`.scene-neutral`) — `WeatherSceneBackground` only mounts once real
results exist, so a weather scene is never guessed before analysis
completes, and never shown while a request is still in flight.

### Weather Scene Lab (development-only)

`lib/weatherScene/devSceneOverride.ts` — a `useSyncExternalStore`
module-level store (the same pattern `lib/storage/recentTrips.ts`
already uses), not a prop threaded through `TripForm` ->
`ResultsView` -> `DetailsDrawer` -> `WeatherSceneBackground`. The
`DevSceneOverride` it carries is the FULL compositional tuple
(`label`, `condition`, `dayPhase`, `sky`, `precipitationType`,
`intensity`, `lightning`) rather than just condition+dayPhase — several
named presets need a combination a real forecast could never
independently produce (e.g. "Thunderstorm + Light Rain" needs
`intensity: "light"`, where a real thunderstorm always derives
`"heavy"`; "Thunderstorm" alone needs `precipitationType: "none"` with
`lightning: true` for a genuine dry storm).

`components/weatherScene/scenePresets.ts` defines 21 named presets
(Clear/Mainly Clear/Partly Cloudy/Overcast Day+Night, Fog, Light/
Moderate/Heavy Rain, Light/Freezing Drizzle, Freezing Rain, Light/
Moderate/Heavy Snow, Snow Showers, Thunderstorm, Thunderstorm + Light
Rain, Thunderstorm + Heavy Rain). `components/weatherScene/
WeatherSceneLab.tsx` (rendered inside `DetailsDrawer`'s existing
`process.env.NODE_ENV === "development"`-gated section, as another
`DevSection`) renders them as toggleable pills plus an independent day/
night toggle and a "Use real forecast" reset, always showing "Visual
preview only — does not change trip data." `applyDevSceneOverride` is a
pure, non-mutating function called only from `WeatherSceneBackground`,
with no path to any analytical code — proven by
`devSceneOverride.test.ts` (the override never touches
`RouteWeatherAnalysis`) and by `DetailsDrawer.test.tsx` (the Lab never
renders when `NODE_ENV !== "development"`, which is how this project's
test process always runs — so the "absent in production" guarantee is
exercised directly, not just asserted).

## Route Conditions architecture

A presentation-only hazard/condition summary, built from
already-computed weather/traffic/transit results — no new analysis, no
new provider calls. Sits between the Journey/Disruption row and the map
in `ResultsView`'s hierarchy, so a user sees what they'll encounter
before inspecting the route visually.

### `RouteConditionItem` and severity

`lib/conditions/types.ts` defines `RouteConditionItem` (`category`,
`title`, `summary`, `severity`, optional `source`/`affectedPortion`/
`detail`) and `RouteConditionSeverity` — `"neutral" | "notice" |
"warning" | "severe"`, visual emphasis ONLY, never a probability and
never read by `lib/scoring/`. `lib/conditions/severity.ts` centralizes
every evidence-to-severity mapping (never scattered `if severe then
red` through JSX):

- **Official ECCC alerts** (`weatherAlertSeverity`): prefers the
  provider's own `severityColor` (`risk_colour_en` — Canada's public-
  alerting Red/Orange/Yellow/Green convention) over the alert-type word;
  falls back to alert type (warning -> severe, watch -> warning,
  advisory/statement -> notice) only when no colour was supplied, and to
  `"notice"` (never an invented `"severe"`) when neither exists.
- **Ordinary weather** (`weatherConditionSeverity`): reuses the SAME
  resolved `WeatherSceneCondition` already driving the background scene
  (via `resolveWeatherScene`, called again — a cheap pure function, not
  a second provider request) — never a second, independently-derived
  classification that could disagree with the visible atmosphere.
  Thunderstorm alone is `"severe"`; heavy rain/snow/freezing rain is
  `"warning"`; ordinary precipitation/fog is `"notice"`; clear/cloudy is
  `"neutral"`. A precipitation vote with no measurable mm/cm behind it is
  demoted to neutral before display.
- **Transit** (`transitSegmentSeverity`): a canceled trip or a
  `"noService"` alert is `"severe"`; a `"significantDelays"` alert, a
  skipped stop, or a genuine 10+ minute realtime delay is `"warning"`;
  a lesser alert or a 1-10 minute delay is `"notice"`; schedule-only (no
  realtime yet) is explicitly `"neutral"` — informational, never treated
  as a disruption on its own.
- **Road events** (`roadEventSeverity`): a direct pass-through of
  DriveBC's own `RoadEventSeverity` (major/moderate/minor) — never
  re-derived from the event's free-text headline; `"unknown"` gets the
  conservative `"notice"` treatment.
- **Traffic** (`trafficDelaySeverity`): capped at `"warning"` — ordinary
  car congestion is never presented as `"severe"`, which is reserved for
  official alerts and unambiguous factual events.

### Ordering

`buildRouteConditions.ts` returns one flat, severity-sorted list
(severe -> warning -> notice -> neutral); within equal severity, a
fixed tie-break order (weather hazard -> road -> traffic -> transit ->
ordinary weather metrics) matches the requested priority. Only
categories relevant to the route's actual mode composition are
included (weather and road events for every mode; transit only for
bus/rail; traffic only for drive) — DriveBC events are capped at 3,
pre-sorted by severity, so a route with many minor events doesn't crowd
out everything else.

### Alert title capitalization

`lib/conditions/titleCase.ts`'s `formatAlertTitle` is a SAFE formatter
for short alert titles only ("rainfall warning" -> "Rainfall Warning"),
never called on body text/descriptions. An entirely-uppercase title is
treated as "shouting" and title-cased normally; a short embedded
all-caps word in an otherwise normal-cased title (e.g. a genuine
acronym) is left as-is. The original provider string is never mutated
— only the display changes.

### Presentation

`components/results/routeConditionVisuals.ts` centralizes severity ->
Tailwind classes and the `SEVERITY_LABEL` text ("Normal"/"Notice"/
"Warning"/"Severe") shown alongside every non-neutral item — severity is
never conveyed by color alone. `RouteConditions.tsx` renders each item
as a compact bordered row (small accent border/badge, never a solid
full-card color), with a category label, title, summary, optional
detail/affected-portion/source line.

## Trip itinerary architecture

`lib/itinerary/buildItinerarySteps.ts` turns the route's own segments
(plus, for transit legs, the matched `TransitSegmentAnalysis`) into a
plain step list — no new routing/transit request. A `RouteSegment`
missing a stop/headsign field simply produces a step without that
field; nothing is ever fabricated (confirmed by dedicated tests). Walk
segments between two transit legs are labeled "Transfer"; the first/
last walk stays plain "Walk". A single-segment car/walk/cycle route
naturally produces exactly one step, which is what makes it read as a
simple summary rather than a numbered list — no special-casing needed.
`components/results/TripItinerary.tsx` renders these steps next to
`RouteMap` — see "Map layout: landscape-dominant, conditional on route
shape" below for how the two are arranged.

### Map markers and the itinerary <-> map highlight

`routeMapGeometry.ts`'s `transitBoardingWaypoints` produces one small
numbered marker per transit leg's real boarding stop (from
`TransitStopReference.latitude`/`longitude` — never a guessed location);
a leg with no matched stop is simply omitted. `RouteMap` accepts an
optional `highlightedSegmentId` — clicking an itinerary step (or a map
segment, via a `click` listener on each `Polyline`) lifts a single piece
of state in `ResultsView` that both components read, restyling the
matching polyline's stroke opacity/weight in place (`Polyline
.setOptions`) rather than rebuilding the map. This is the full extent of
the interaction — no navigation state beyond "which segment id is
currently selected." `AdvancedMarkerElement`s are created after every
polyline and rely on Google's documented default pane ordering (markers
above overlays) to stay visible over the route strokes — not manually
verified in a browser (no browser-automation tool exists in this
environment), so flag any marker-under-line report as a real bug.

### Route line: casing + mode color (V2)

Each segment now draws TWO polylines (`styleForMode` in
`routeMapGeometry.ts`): a solid, light CASING (halo, `casingWeight: 9`,
shared across every mode so it reads against roads/parks/water/labels
regardless of basemap style) underneath, and a narrower MODE-COLORED
route line (`routeWeight: 6`) on top — the same technique every major
navigation app uses for route-line visibility, not a WinterRoute
invention. Every mode gets its own distinct color (drive: dark navy,
bus: saturated blue, rail: indigo, walk: dark charcoal, cycle: teal/
green) — never two modes sharing a color, and never relying on color
alone: walk is additionally DASHED (the casing stays solid underneath;
only the inner route line's `icons` carry the dash pattern), so the
walking portion of a mixed route is distinguishable even without color
vision. The itinerary <-> map highlight (above) restyles both the
casing and the route line together — muted segments dim both, the
highlighted segment's route line also gains weight — and for a dashed
segment, restyling rebuilds its `icons` array with the new opacity
rather than trying to animate a Polyline's own (invisible, for dashed
segments) `strokeOpacity`.

## Route Conditions weather headline architecture

`lib/conditions/weatherHeadline.ts` turns the existing multi-model,
multi-sample `RouteWeatherAnalysis` into ONE direct answer — "will it
rain/snow on my commute?" — with model agreement and route coverage
kept as secondary, supporting information rather than the headline
itself. Three independent, centralized, PRESENTATION-ONLY axes (never
read by `lib/scoring/`, never a new severity score):

- **Intensity** (`none`/`light`/`moderate`/`heavy`) — from the actual
  max precipitation-mm/snowfall-cm amount across the route's forecasts,
  against fixed thresholds loosely following standard hourly-rate
  intensity conventions (documented in the module, not scattered
  `if precipitation > X` checks in JSX).
- **Agreement** (`none`/`low`/`medium`/`high`) — from the SAME
  `modelsPredicting`/`modelsWithData` counts the old "3/3 models"
  wording already used, now driving the headline's VERB ("possible" /
  "likely" / "expected") instead of being the whole sentence.
- **Route coverage** (`isolated`/`part`/`much`/`most-all`) — the SHARE
  of actual weather sample points along the route (`analysis.samples`,
  not just an aggregate model count) where at least one model detected
  measurable precipitation at THAT point — so "across the route" is
  never said from a single affected sample.

These three combine into a `WeatherConditionPresentation` with TWO
separate fields, deliberately never concatenated into one run-on
phrase: a short, prominent `title` ("Light Rain Possible", "Heavy Rain
Expected", "Clear") stating WHAT MAY HAPPEN plus how confidently, and
one natural full `sentence` ("One forecast model predicts light rain
across much of your route.") stating WHERE, with correct singular/
plural grammar (`modelSubjectAndVerb`: "The forecast model predicts…" /
"Two of three forecast models predict…" / "All three forecast models
predict…"). Never a probability percentage, and never the technical
word "measurable" in user-facing text (kept, if at all, to
Details/dev diagnostics only). When neither rain nor snow has real
intensity, the SAME already-resolved `WeatherSceneCondition` (via
`resolveWeatherScene` — reused, not re-derived, so the Route Conditions
headline can never disagree with the visible weather-scene background)
drives a plain sky-condition title+sentence instead (clear/
partly-cloudy/cloudy/fog). Wind is promoted from an ordinary supporting
metric into its own prominent "Strong Wind" condition only when actual
gust data crosses a documented threshold. Official alerts stay their
own separate item (unchanged from before) — never replacing the
forecast headline, only complementing it, since both are independent
items in the same sorted list.

`RouteConditionItem` gained an `emphasis: "primary" | "supporting"`
field (`buildRouteConditions.ts`) so `RouteConditions.tsx` can render a
small number of large, bordered cards (the dominant weather answer,
official alerts, genuine disruptions) alongside a single compact block
of ordinary metrics (temperature, ordinary wind, "No snow expected")
— never five equal-size cards for trivial information. An INACTIVE
precipitation type (e.g. snow, when only rain is happening) deliberately
does NOT reuse its `WeatherConditionPresentation.title`/`.sentence` in
that compact row — those are sized for a prominent card, not a single
glanceable line — and instead gets a short `"Snow"` / `"No snow
expected"` pair, matching the other compact metrics' format.

### Badge wording: internal severity vs. displayed word

`RouteConditionItem` also gained an optional `badgeLabel?: string`
(`lib/conditions/types.ts`). Internal `RouteConditionSeverity` values
(`neutral`/`notice`/`warning`/`severe`) are UNCHANGED and still drive
color/emphasis — only the displayed BADGE WORD can be overridden per
item, for the two cases where a more meaningful word than the generic
severity label exists:

- **Ordinary forecast uncertainty** (no official alert): the badge
  reads the weather agreement word — "Possible" (low agreement),
  "Likely" (medium), "Expected" (high) — via `AGREEMENT_BADGE` in
  `buildRouteConditions.ts`, never the internal-jargon "Notice".
- **An official ECCC alert**: the badge reads the provider's own
  classification, title-cased (`formatAlertTitle(alert.alertType)` —
  e.g. "Warning", "Watch", "Advisory") — factual and provider-sourced,
  not WinterRoute's invented severity word.

Every other category (transit/road/traffic) still falls back to the
generic `SEVERITY_LABEL[severity]` map in `routeConditionVisuals.ts`,
where the `"notice"` value now reads `"Minor"` instead of the
meaningless-to-users `"Notice"` — the one universal wording fix that
applies even where no per-item `badgeLabel` exists.

## Route note presentation (provider disclaimers)

`lib/route/routeNotePresentation.ts` recognizes Google's required
walk/cycle beta disclaimer by EXACT identity against the same
`WALK_CYCLE_PROVIDER_WARNING` constant `computeRoute.ts` pushes (never
by guessing at arbitrary provider text) and re-words it into a calm,
mode-aware sentence ("Walking directions are in beta and may
occasionally miss sidewalks or pedestrian paths."). Any OTHER,
unrecognized provider warning is shown as-is under the same neutral
"Route note" heading — safer than inventing a simplification for text
WinterRoute doesn't control. `RouteNote.tsx` renders this with quiet
info styling (never amber/red hazard styling), and keeps the full
original provider wording available, verbatim, behind a "Show details"
toggle — visible to every user, not gated to development.

## Preview My Commute architecture

WinterRoute's signature interactive feature — a compressed, visual-only
animation of a marker moving along the route's own already-computed
geometry, with the mode-appropriate marker and the SAME map<->itinerary
highlight the click interaction already uses. See
`docs/decisions/0013-weather-scene-composition-and-commute-preview.md`
for the decisions behind the design below. Never issues a new routing/
geometry request, and never reads or writes any risk/duration/timing/
weather/transit-analysis state — `src/lib/preview/` imports nothing
from `lib/scoring/`, `lib/timing/`, `lib/duration/`, or `lib/weather/`.

### Layers

- **`lib/preview/geometry.ts`** (pure, framework-agnostic) —
  `cumulativeDistances` (haversine) and `pointAtFraction`, which
  interpolates a point `fraction` (0-1) of the way along a polyline BY
  DISTANCE, not by point-index, so an uneven distribution of real road-
  geometry points (far more points on curves than straightaways) never
  distorts perceived marker speed.
- **`lib/preview/timing.ts`** — `buildPreviewSchedule(route)` turns each
  segment's REAL duration share (falling back to distance, then equal
  share, when duration is unknown) into a COMPRESSED timeline: a
  proportional slice, floored at a minimum (`MIN_SEGMENT_MS`, so a tiny
  transfer stays visible), then the WHOLE schedule rescaled into
  `[6000ms, 15000ms]` total — a 90-minute real commute previews in
  roughly the same ~10-15s as a 10-minute one, and the per-segment floor
  is a SOFT floor that can compress slightly further during that final
  rescale for a route with many tiny segments (the hard total-length cap
  always wins).
- **`lib/preview/engine.ts`** — `frameAtElapsedMs(route, schedule,
  elapsedMs)`, the single pure function driving playback: finds the
  active segment for a given elapsed time (the LAST schedule entry whose
  `startMs <= elapsed`, so exactly at a boundary the marker has already
  "transitioned" to the next mode), then interpolates its position via
  `pointAtFraction` over that segment's real geometry
  (`segmentGeometryPoints` — falls back to a straight `[start, end]`
  line exactly like `routeMapGeometry.ts`'s `segmentPath`, kept as an
  independent small function so this module stays Google-Maps-type-free
  and trivially unit-testable). No side effects, no timers.
- **`components/preview/usePreviewPlayback.ts`** — the state machine
  (`idle`/`playing`/`paused`/`complete`), the `requestAnimationFrame`
  loop, and the imperative wiring. Injectable `PreviewClock`
  (`now`/`requestFrame`/`cancelFrame`, defaulting to real
  `performance.now`/`requestAnimationFrame`/`cancelAnimationFrame`)
  makes the whole thing unit-testable with a fully manual, synchronously
  -advanced fake clock instead of real timers.
- **`components/map/RouteMap.tsx`** — exposes a `RouteMapPreviewHandle`
  (`setPreviewMarker(position, mode)`) through an optional
  `previewHandleRef` prop, populated once the map is ready. The preview
  loop calls it directly every tick to move/re-style a single
  `AdvancedMarkerElement` — never through React state or a re-render of
  `RouteMap` itself.
- **`components/preview/previewMarkerContent.ts`** — builds the moving
  marker's DOM content: a small colored circle (reusing the SAME
  per-mode accent colors as route-line styling) with an original inline
  SVG glyph per mode (walk/cycle/drive/bus/rail — simple geometric
  shapes, never copied TransLink/Uber artwork) and a white outline/halo
  so it stays visible over any weather-scene backdrop or dense
  precipitation particle layer.
- **`components/preview/CommutePreviewControls.tsx`** — the "▶ Preview
  my commute" pill (not a hero CTA) plus Pause/Resume/Stop/Replay,
  rendered near the map/itinerary in `ResultsView`. Progress is a plain
  "Previewing commute…" status line, never a fabricated percentage.

### Why the animation loop isn't a self-recursing `useCallback`

`usePreviewPlayback`'s tick function is a plain function assigned once
(inside a `useEffect` with an empty dependency array) to a ref
(`tickFnRef`), reading route/schedule/clock through OTHER refs kept in
sync every render. A `useCallback` that closes over changing props/state
directly and recursively calls itself (`clock.requestFrame(tick)` from
inside `tick`) is flagged by this project's `eslint-plugin-react-hooks`
ruleset as an unsafe self-referencing pattern — this mirrors
`WeatherParticles.tsx`'s existing rAF loop (a plain function declared
inside `useEffect`), with the extra ref-based indirection a *reusable
hook* (rather than a one-off effect) needs to stay safely callable from
`start()`/`resume()`.

### Mixed-mode transitions and itinerary/map highlighting

A mixed route (Walk -> Bus 145 -> Rail -> Walk) is just four schedule
entries in sequence — `frameAtElapsedMs` already handles the mode
change at each boundary, and `previewMarkerContent.ts` swaps the
marker's `content` (not the marker itself) when the mode differs from
its last-rendered one. `usePreviewPlayback` feeds the active segment id
into `ResultsView`'s EXISTING `highlightedSegmentId` state — the exact
same state the map<->itinerary click interaction already uses — so
playback highlighting and manual-click highlighting are literally the
same mechanism, never two parallel ones. `aria-live` announcements fire
only at meaningful transitions (start, each new segment — "Bus 145
segment" when a matched transit line name is available, else "Bus
segment"/"Rail segment"/etc. — and completion), never every frame.

### Manual selection during playback

Clicking a map segment or itinerary step while the preview is playing
or paused is intentionally a no-op (`ResultsView` passes
`onSelectSegment`/`onSelectStep` as `undefined` while `previewLive` is
true) rather than trying to make a manual click "jump" the preview —
the simpler, more robust choice over reconciling two independent
sources of "what's active" for a ~10-15 second animation. Stopping (or
finishing) hands control straight back to manual selection.

### Reduced motion

Rather than a second, parallel stepped-preview implementation, the SAME
schedule/timing/highlighting/announcement machinery runs; only the
per-frame POSITION calculation changes — `usePreviewPlayback` snaps to
the active segment's MIDPOINT (via a second `frameAtElapsedMs` call
using that segment's midpoint time) instead of continuously
interpolating, so the marker visibly holds still within a segment and
only moves at segment boundaries. `WeatherSceneBackground`'s own
reduced-motion behavior (crossfade/cloud-drift/particles/lightning) is
unrelated and unaffected — both respect the SAME shared
`lib/hooks/useReducedMotion.ts` hook, extracted this stage from what
were previously two independent copies (`WeatherSceneBackground.tsx`,
`LoadingSequence.tsx`) of the identical `matchMedia` pattern.

### Performance and cleanup

No React state updates per animation frame — only `activeSegmentId`/
`status`/`announcement` change, and only at meaningful transitions;
the marker's position updates imperatively through
`RouteMapPreviewHandle` every tick. The animation frame is canceled on
pause/stop/unmount (an effect's cleanup calls the same
`stopAnimationLoop` used by every explicit action), and `RouteMap`
itself removes the preview marker from the map in its own effect
cleanup (unmount, or a route change — which fully remounts `RouteMap`
per its existing architecture).

## Final results layout/wording polish (map, weather copy, Why section)

A focused presentation-only pass over the results screen — no
provider/scoring/duration/timing/WeatherScene logic touched, confirmed
by the fact that this stage's diff never enters `lib/weather/`,
`lib/traffic/`, `lib/transit/`, `lib/route/`, `lib/scoring/`,
`lib/timing/`, `lib/weatherScene/`, or any Maps API request code —
only `lib/conditions/` (already presentation-only by construction, see
above), `components/results/`, and `routeMapGeometry.ts`'s STYLING
constants are untouched (no changes there at all this stage).

### Map layout: landscape-dominant, conditional on route shape

`ResultsView.tsx` derives `hasTransit = route.segments.some(s =>
s.mode === "bus" || s.mode === "rail")` — the same test already used
elsewhere in this file — and branches the map+itinerary row on it:

- **Transit route** (a genuinely multi-step itinerary worth dedicated
  width): side-by-side at `lg:`, `lg:grid-cols-[2fr_1fr]` — the map
  gets roughly two-thirds of the row, the itinerary column the rest.
- **Simple route** (single-segment walk/drive/cycle — `TripItinerary`
  naturally renders exactly one compact summary row for this case, see
  "Trip itinerary architecture" above): no side column is reserved at
  all; the map renders full width, with the one-line itinerary summary
  stacked beneath it rather than squeezed into a narrow rail that would
  otherwise sit mostly empty.

`RouteMap`'s own height classes (`h-[260px] sm:h-[340px]
lg:h-[420px]`) were already within the requested mobile/desktop ranges
and were left unchanged; only the wrapping grid/flex layout around it
changed. `fitBounds` logic in `RouteMap.tsx` is untouched — it already
operates on the container's actual rendered size, so a wider container
means a wider fit automatically, with no logic change required. Route
polyline casing/mode-color styling (`routeMapGeometry.ts`) was
similarly left untouched — no responsive bug required changing it.

### "Why this commute is different" no longer reads `risk.explanation`

`WhySection.tsx` previously fell back to `riskState?.risk.explanation`
when neither `timing` nor `duration` had their own explanation —
`lib/scoring/explanation.ts` builds a full per-factor narrative
(including "nothing happened" sentences like "No relevant road events
were found near the route." and "Weather evidence along the route
includes precipitation (1/3 models).") for an entirely different
purpose, and that fallback let those sentences leak into a
low-disruption trip's "why" section, where they read as confusing
technical noise. `timingState` is always populated alongside
`riskState` in the real app flow (`TripForm.tsx` sets both
synchronously together), so the fallback never legitimately fired —
`WhySection` now takes `weatherState`/`route` instead of `riskState`
and never reads risk data at all.

In its place, when there is genuinely no "reason" (nothing rose to
disruption level) but rain or snow is genuinely expected however
uncertain, `WhySection` calls the SAME `buildWeatherHeadlines` Route
Conditions uses and folds that condition's `.sentence` into the "What
to know" notes pool — reusing the identical wording Route Conditions
already shows for the same forecast, rather than inventing a second,
possibly-inconsistent description. `RiskSummary` still receives
`riskState` as before; only `WhySection`'s props changed.

## Layered architecture (target shape)

WinterRoute is a prediction pipeline with a UI on top, not a UI with a
weather API attached. The layers, in dependency order:

1. **Domain/config layer** — trip request model (origin, destination,
   time + arrive-by/leave-at, mode), supported-city config, and the
   geography/segment model a route gets broken into. This has no knowledge
   of any external API.
2. **Data ingestion layer** — three adapters now built, all following the
   same shape (HTTP mechanics isolated from domain transformation):
   `lib/google/` (Places + Routes, baseline and traffic-aware — see
   "Location & routing integration" above), `lib/weather/providers/`
   (Open-Meteo + ECCC — see "Weather data pipeline" above), and
   `lib/traffic/providers/` (DriveBC — see "Traffic data pipeline"
   above). Live-transit sources aren't chosen yet; when they are, they'll
   follow the same split.
3. **Feature engineering / scoring layer** (not built yet) — turns the
   per-sample, per-model weather data and the traffic/road-event data
   into the commute risk score, expected duration range, and confidence
   level described in the project brief. `lib/weather/ensemble.ts`'s
   descriptive statistics are the closest thing that exists today, and
   are deliberately *not* this layer — see "Model agreement vs.
   calibrated confidence" above. Weather and traffic are computed as
   fully separate analyses today (see "Traffic data pipeline" —
   "Explicitly deferred") — this is the layer that will eventually
   combine them, once that combination is validated.
4. **Presentation layer** — `src/app/*`, thin route/page components that
   call into the layers above and render results. Route files should stay
   thin; logic belongs in the layers below so it's testable independent of
   Next.js.
5. **Evaluation layer** (not built yet, architecture only) — storage of
   predicted-vs-actual outcomes and the metrics computed from them. Deferred
   entirely for now, but layers 1–3 are designed so a prediction object is
   a concrete, loggable value rather than something implicit in UI state —
   that's what will make this layer possible to bolt on later without a
   rewrite.

### Proposed folder layout (to be introduced incrementally, not all at once)

```
src/
  app/
    api/          Route Handlers — the only server code allowed to call Google [exists]
    (pages)       routes only — thin pages/layouts, no business logic
  components/     presentational UI components
  lib/
    trip/         trip request types, validation, formatting        [exists]
    route/        route/segment domain types, compute orchestration [exists]
    google/       Places/Routes provider adapters + transforms      [exists]
    geo/          V1 service-area check, route-sampling geometry math [exists]
    storage/      localStorage-backed recent locations/trips        [exists]
    client/       browser-side wrappers around WinterRoute's /api/* [exists]
    api/          shared Route Handler error mapping                [exists]
    weather/      route sampling, multi-model providers, ensemble   [exists]
    traffic/      traffic-aware analysis, DriveBC road events        [exists]
    scoring/      (future) feature engineering + risk/confidence scoring
```

Folders not marked `[exists]` are still proposal — they should appear when
there's real code to put in them, in later stages, per source/feature. No
`src/types/` folder was actually needed: domain types have stayed colocated
with their domain (`lib/trip/types.ts`, `lib/route/types.ts`) since each is
only used by its own domain logic so far.

### Why this shape

- **Segment-aware by construction.** Because ingestion and scoring operate
  on route segments (not "the city's weather"), the route-level analysis
  described in the project brief (e.g. Burnaby Mountain vs. Downtown) is the
  natural data shape rather than a later retrofit.
- **Source-swappable.** Weather/traffic/transit each get their own adapter
  boundary so multiple providers can be compared or combined (data fusion)
  without the scoring layer caring where data came from.
- **Mode-aware.** Traffic affects car and bus segments strongly, rail
  segments weakly, and walking segments not at all (walking has its own
  weather-exposure risk instead) — the layering keeps that as a per-segment,
  per-mode concern in the scoring layer rather than a single global "traffic
  adjustment."
- **Expandable geography without a rewrite.** Supported cities/regions are
  config, not hard-coded logic, so V1's three cities can expand later.
- **A prediction is a value, not UI state.** Keeping scoring output as a
  plain typed object (not something assembled inline in a React component)
  is what makes both testing and the future predicted-vs-actual evaluation
  layer possible.

## Data pipeline (conceptual, target shape)

```
collection -> cleaning -> joining/integration -> feature engineering
  -> prediction/scoring -> uncertainty/confidence -> evaluation -> improvement
```

**Collection** now has real ingestion adapters for Google (places/routes),
weather (Open-Meteo, ECCC), traffic (Google traffic-aware, DriveBC), and
transit (TransLink GTFS static + GTFS-Realtime).
**Cleaning** is the missing-data handling in `lib/weather/transform.ts`
(honest `undefined`, never a substituted value) and Google's response
parsing. **Joining/integration** is `analyzeRouteWeather` combining route
sampling with multi-model weather and alerts into one
`RouteWeatherAnalysis`. Everything from **feature engineering** onward
doesn't exist yet. This is recorded here so later stages build toward it
deliberately instead of the project drifting into being a frontend with a
weather API bolted on.

## Explicitly deferred (and why)

- **Final consolidated results UI and machine learning.** The now-complete
  factual layers feed three independent interpretable V0 models —
  `lib/scoring/` (severity index), `lib/duration/` (expected-duration
  range), and `lib/timing/` (recommended departure / expected arrival,
  see "Recommended departure / expected arrival model (V0)" above) — kept
  as separate development-preview sections until timing behavior is
  validated; none of them is ML. See `docs/decisions/0008-risk-model-v0.md`,
  `docs/decisions/0010-duration-model-v0.md`, and
  `docs/decisions/0011-timing-recommendation-v0.md`.
- **Dynamic weather-reactive visuals.**
- **A database.** Recent locations/trips use localStorage only (see
  "Recent location & trip history" above); weather and traffic analyses
  aren't persisted at all beyond a short in-memory cache (see "Caching
  and data freshness" and "Caching and freshness (traffic)" above) — no
  accounts, no server-side persistence yet.
- **Animated weather backgrounds.** Visually significant but orthogonal to
  the prediction pipeline; building it before there's real trip data to
  react to would mean re-doing it later anyway.
- **ML models.** Per the project brief, a model gets adopted only once
  logic/data-driven scoring exists and a real case can be made that ML
  improves on it — not by default.
- **Persisted predicted-vs-actual storage.** `lib/evaluation/` now
  defines the *types* (`PredictionSnapshot`, `CommuteOutcome`) and
  dev-only tooling (serialization, reproducibility, a privacy-conscious
  storable transform, a dev JSON export) for this — see
  "Prediction-evaluation architecture" above — but no database, no
  continuous collection, and no user-facing outcome survey exist. A real
  persistence choice is still deliberately deferred.
- **Real evaluation metrics** (rank correlation, confusion matrix,
  calibration). Documented as a plan in
  `docs/decisions/0009-v0-hardening-and-evaluation-design.md`; requires
  real observed outcomes, which don't exist yet.

## Open questions for later stages

- How a missed-transfer probability gets computed from the transit
  segment timing data already being preserved for that purpose
  (`lib/scoring/types.ts`'s transfer-related fields exist; the
  probability calculation itself is deliberately not built yet).
- How/when the V0 heuristic curves and weights (`lib/scoring/config.ts`)
  get replaced by statistically calibrated or learned relationships once
  real predicted-vs-actual outcome data exists — the *types* for this
  now exist (`lib/evaluation/`), but the actual persistence layer, a
  UX for collecting `CommuteOutcome`s, and the metrics themselves
  (documented in `docs/decisions/0009-v0-hardening-and-evaluation-design.md`)
  are still future work.
- Whether/how to re-verify V1 service-area membership server-side at
  route-compute/weather-analyze/traffic-analyze time — currently
  client-enforced only (see "V1 service area" limitation above).
- Where evaluation data (predicted-vs-actual, per model, per traffic
  estimate) eventually lives — needs a persistence choice not made yet,
  and is the main reason durable caching for weather/traffic data was
  deliberately deferred in favor of a short-lived in-memory cache rather
  than building a real cache layer twice (see "Caching and data
  freshness" and "Caching and freshness (traffic)" above).
