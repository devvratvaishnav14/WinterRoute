# WinterRoute — Data Sources

Records what external data sources were chosen, why, and what limitations
were discovered while integrating them. WinterRoute's feature-engineering
and experimental risk-model layer (`lib/scoring/`) introduces no new
external data source — it's a pure transformation of the sources already
listed here; see `docs/architecture.md` "Feature engineering &
experimental risk model (V0)" and `docs/decisions/0008-risk-model-v0.md`.

## Google Maps Platform — Places API (New) + Routes API

**What:** location autocomplete + place resolution (Places API (New)) and
baseline route computation (Routes API `computeRoutes`).

**Why chosen (for V1):**

- Metro Vancouver coverage, including TransLink bus/SkyTrain schedule data
  through Routes API's `TRANSIT` mode — confirmed with real requests during
  this stage's build (see below), not assumed.
- A single provider covers both location search and multi-modal routing
  (walk/drive/bicycle/transit), which keeps the V1 integration surface
  small. This is a starting point, not a permanent commitment — the
  provider/adapter boundary (`lib/google/`) exists specifically so this can
  be swapped or supplemented later without touching the rest of the app
  (see `architecture.md`).
- "Places API (New)" / "Routes API" (not the legacy Directions/Places
  APIs) because they're Google's current, actively developed APIs with
  field-mask-based responses, which directly serves the cost-discipline
  goal below.

**What this integration deliberately does NOT do:** weather, live traffic
conditions, road incidents, or any prediction/risk logic. Routes API is
used only for `staticDuration` (a live-traffic-free baseline), never
`duration` (traffic-aware). See "Baseline route" in
`decisions/0004-google-places-and-routes-integration.md`.

### Cost / quota discipline

- Every request uses an explicit field mask (`X-Goog-FieldMask`) —
  never a `*` wildcard. Autocomplete requests only `placeId` and display
  text; Place Details only `id, displayName, formattedAddress, location,
  addressComponents`; `computeRoutes` only the fields the `Route`/
  `RouteSegment` model actually uses. No reviews, photos, ratings, hours,
  or phone numbers are ever requested.
- Autocomplete uses session tokens (one logical session per "start typing
  → pick a result → resolve it", not one per keystroke), so Google bills
  a session rather than every individual keystroke's request.
- A minimum input length (2 characters) and a ~350ms debounce gate
  requests both client-side (before typing even reaches the network) and
  server-side (`AUTOCOMPLETE_MIN_INPUT_LENGTH` re-checked in
  `app/api/places/autocomplete/route.ts`, since that endpoint could be
  called directly, bypassing the client).

### Known limitations discovered while integrating (not assumed from docs)

- **`routingPreference: TRAFFIC_UNAWARE` rejects any timestamp.** Google
  returns `400 INVALID_ARGUMENT` — *"Timestamp cannot be set for
  TRAFFIC_UNAWARE routing mode"* — if `departureTime`/`arrivalTime` is sent
  alongside it. Found via a real failing request while building this
  stage, not documented anywhere I found beforehand. WinterRoute now never
  sends a timestamp for `DRIVE` (see `lib/route/computeRoute.ts`) — which
  is actually the right behavior anyway, since a live-traffic-free static
  baseline shouldn't vary by time of day.
- **Turn-by-turn step granularity.** A single 20-minute drive can come
  back as 15+ raw `steps` (one per maneuver). WinterRoute merges
  consecutive same-mode steps into one segment — see the segment-merge
  rule documented in `lib/google/transform.ts` and
  `decisions/0004-google-places-and-routes-integration.md`.
- **WALK/BICYCLE routes carry a mandatory disclaimer.** Google's terms
  require showing: *"Walking, bicycling, and two-wheel routes are in beta
  and might sometimes be missing clear sidewalks, pedestrian paths, or
  bicycling paths."* WinterRoute surfaces this as a `providerWarning` on
  the route preview for those modes — not something we chose to add.
- **Places API (New) `location` is flat** (`{ latitude, longitude }`)
  while Routes API nests the same shape under `latLng`
  (`{ latLng: { latitude, longitude } }`) for waypoints and step
  locations. Confirmed by making real calls to both and comparing —
  easy to get wrong if assumed to be consistent across the two APIs.
- **Municipality detection is best-effort**, not a geofence — see
  `lib/geo/serviceArea.ts` and the "Service area" section of
  `decisions/0004-google-places-and-routes-integration.md`.

## Open-Meteo — Canadian HRDPS/RDPS, ECMWF IFS, NOAA GFS

**What:** hourly numerical weather forecasts for WinterRoute's route
sample points, from three independent models, via Open-Meteo's structured
forecast API (`https://api.open-meteo.com/v1/forecast`).

**Why chosen:**

- Open-Meteo is a structured access layer over the real government/agency
  models WinterRoute actually wants — it doesn't run its own weather
  model, it re-serves ECCC's, ECMWF's, and NOAA's outputs with a
  consistent request/response shape. That's what makes "three independent
  models through one integration" practical for V1.
- Free for non-commercial/development use, no API key, CC BY 4.0
  licensed — see "Attribution" below.
- Supports batching multiple coordinates into one request (critical for
  "Cost discipline" below) and lets a specific model be requested by name
  (`models=`) instead of an opaque auto-blended "best match," which is
  what makes preserving each model's forecast separately possible at all.

**Why three independent models, not one:** a single generic forecast
can't support the kind of model-agreement statements this project's data
science goals need later (bias measurement, calibration, uncertainty —
see `overview.md`). Averaging three models into one number *now*, before
any of that validation exists, would throw away exactly the information
a future evaluation pipeline needs. See "Why model results stay separate"
in `architecture.md`.

**Models used** (identifiers verified against the live API while building
this — an invalid model name is rejected with a 400, which is how
`cmc_gem_rdps_10km`/`cmc_gem_global`/`ncep_gfs_global_025` were ruled out
as guesses that turned out wrong):

| Slot | Model | Identifier | Resolution | Real horizon (empirically confirmed) |
|---|---|---|---|---|
| Canadian (primary) | HRDPS | `cmc_gem_hrdps` | 2.5km | ~48-60h from request time |
| Canadian (fallback) | RDPS | `cmc_gem_rdps` | 10km | ~96h from request time |
| Independent 2 | ECMWF IFS | `ecmwf_ifs025` | 25km | 10+ days |
| Independent 3 | NOAA GFS | `ncep_gfs013` | 13km | 10+ days |

The "Canadian" slot always requests both HRDPS and RDPS for every sample
point, and per point-and-time picks HRDPS's value if it's actually
covered, falling back to RDPS only when it isn't — see "Forecast horizon
handling" in `architecture.md` for exactly how "covered" is determined
(never a hardcoded hour cutoff).

### Cost / quota discipline

- Free-tier limits (per Open-Meteo's terms): 10,000 calls/day, 5,000/hour,
  600/minute. A single WinterRoute weather analysis uses **4 HTTP
  requests total** — one per model (HRDPS, RDPS, ECMWF, GFS) — regardless
  of how many sample points that trip has, because every sample point's
  coordinates are batched into one request per model
  (`latitude=49.28,49.19,...&longitude=...`).
- Only the 11 variables WinterRoute actually uses are requested (see
  "Forecast variables" in `architecture.md`) — not Open-Meteo's full
  variable catalog.
- The request window (`forecast_days`) is sized to just cover the
  latest sample time, not a flat "always request 16 days."

### Known limitations discovered while integrating

- **Not every variable is available from every model.** `visibility` was
  `null` for all three named models (HRDPS/ECMWF/GFS) at every point
  tested — it's only populated in Open-Meteo's auto-blended "best match"
  product, which WinterRoute deliberately doesn't use (see above).
  `precipitation_probability` was `null` for HRDPS and GFS but populated
  for ECMWF. Both are represented as `undefined` on `WeatherForecastPoint`
  when absent — never a substituted value.
- **A model's real forecast horizon isn't a fixed number WinterRoute
  hardcodes.** Beyond a model's actual coverage, every hourly variable
  (confirmed via `temperature_2m`) returns `null` in lockstep — WinterRoute
  treats that as "this model doesn't cover this point/time," determined
  per request, not by assuming e.g. "HRDPS always stops at exactly 48h."
- **Batched multi-coordinate responses return grid-snapped coordinates**,
  not an echo of the exact requested lat/lng (e.g. requesting `49.2800`
  can come back as `49.262367` — the nearest grid cell), and results are
  positional (same order as the request), not matched by coordinate
  equality. Confirmed with a real 3-point batch request before writing
  the matching logic.

## ECCC / MSC GeoMet-OGC-API — official weather alerts

**What:** official Canadian weather warnings, watches, advisories, and
statements, from Environment and Climate Change Canada's own service
(`https://api.weather.gc.ca`, collection `weather-alerts`), queried by
bounding box around the route.

**Why ECCC directly, not through Open-Meteo:** official alerts are a
government notification, not a numerical forecast — treating them as
"just another weather variable" from a forecast aggregator would blur an
authoritative warning with a model output. ECCC's own OGC API Features
service is free, requires no API key, and returns real alert polygons
(not just "an alert exists somewhere in BC"), which is what makes genuine
route-relevance checking possible (see "Route-alert matching" in
`architecture.md`).

**Discovering the collection name:** `weather-alerts` wasn't the first
guess — `alerts`, `public-alerts`, `warnings`, `public-weather-alerts`,
`cap-alerts`, and `alerts-realtime` were all tried against the live API
first and returned 404; `weather-alerts` returned 200. The exact schema
(`alert_type`, `alert_name_en`, `publication_datetime`,
`validity_datetime`, `expiration_datetime`, `event_end_datetime`,
`status_en`, `risk_colour_en`, `feature_name_en`, geometry, etc.) was
read from the collection's own published JSON Schema
(`/collections/weather-alerts/schema`), then cross-checked against a real
alert feature, not guessed from CAP conventions in general.

### Known limitations discovered while integrating

- **The collection retains ended/expired alerts** rather than removing
  them — a real feature was observed with `status_en: "ended"` well after
  its `event_end_datetime` had passed. WinterRoute treats an alert as
  active only when `status_en` doesn't say otherwise *and* its
  `expiration_datetime` hasn't passed (`lib/weather/alerts.ts`,
  `isEcccAlertActive`).
- **No API key required** — confirmed by successful unauthenticated
  requests throughout development; nothing was added on WinterRoute's
  side for this.

## Google Routes API — traffic-aware routing (`TRAFFIC_AWARE_OPTIMAL`)

**What:** a second, separate `computeRoutes` call for DRIVE trips —
traffic-aware duration, Google's own no-traffic `staticDuration` for that
same request, and traffic-condition intervals along the route
(`speedReadingIntervals`, via `extraComputations: ["TRAFFIC_ON_POLYLINE"]`).
This is deliberately a distinct request from the baseline routing call
(`lib/google/routes.ts`) — see `architecture.md` "Baseline vs. traffic-aware,
kept distinct."

**`TRAFFIC_AWARE_OPTIMAL` chosen over `TRAFFIC_AWARE`:** confirmed against
Google's current `RoutingPreference` reference. Exact wording: `TRAFFIC_AWARE`
*"applies some optimizations... to significantly reduce latency"*;
`TRAFFIC_AWARE_OPTIMAL` computes *"without applying most performance
optimizations,"* trading latency for accuracy. WinterRoute's traffic
analysis runs once per explicit "Check my commute" submission (never on
every render/keystroke — see "Cost discipline" below), so the latency
this trades away doesn't matter and the accuracy does.

**`TrafficModel: BEST_GUESS`** — confirmed via Google's `TrafficModel`
reference to be available only when `routingPreference` is
`TRAFFIC_AWARE_OPTIMAL` specifically (further confirming that choice).
`BEST_GUESS` (*"the best estimate... given both historical traffic
conditions and live traffic"*) is used, not `PESSIMISTIC`/`OPTIMISTIC` —
the project brief is explicit that a single defensible best-estimate is
enough for this stage, not a worst-case framed as the prediction.

**`staticDuration` semantics, precisely:** Google's own wording is *"the
duration of travel through the route without taking traffic conditions
into consideration"* — for **this specific traffic-aware request**, not
necessarily identical to WinterRoute's own baseline
(`Route.baselineDurationMinutes`, computed by a separate `TRAFFIC_UNAWARE`
request earlier — see `lib/route/computeRoute.ts`). In practice the two
are usually close (confirmed live: 28min baseline vs. 28min
`staticDuration` for the same SFU→Surrey route), but `TrafficAnalysis`
keeps them as two distinct fields
(`referenceBaselineDurationMinutes` vs. `googleStaticDurationMinutes`)
rather than assuming they're the same value — see `architecture.md`.

### Cost / billing discipline

- **`TRAFFIC_ON_POLYLINE` is billed at Google's higher "Routes Preferred"
  rate**, not the basic tier the rest of WinterRoute's Google usage falls
  under (confirmed via Google's traffic-on-polylines documentation) —
  this is a real, deliberate cost decision, not an oversight. It's used
  because the project brief specifically wants per-segment route traffic
  conditions, and the cost is bounded by the same discipline as
  everything else: one traffic-aware request per explicit "Check my
  commute" submission, never per keystroke/render/autocomplete
  interaction.
- **In-memory request cache + in-flight deduplication**
  (`lib/traffic/requestCache.ts`) prevents a double page-refresh or two
  concurrent requests for the same trip from triggering duplicate calls —
  a 2-minute TTL, short enough that near-term traffic never goes stale
  for hours, long enough to absorb accidental duplicate requests. See
  "Caching and freshness (traffic)" in `architecture.md` for why this is
  process-local, not a distributed cache.

### Known limitations / behavior discovered while integrating

- **A future `departureTime` must have real headroom, not just be
  "not in the past."** A first implementation sent our own server's `now`
  as the departure timestamp and Google still rejected it — *"Timestamp
  must be set to a future time"* — confirmed via a real failing request.
  Network latency and clock skew between WinterRoute's server and
  Google's mean "now" by our clock can already be "now or the past" by
  Google's. Fixed with a 15-second forward safety buffer
  (`DEPARTURE_TIME_SAFETY_BUFFER_MS`), applied only when needed.
- **A non-transit "Arrive by" trip whose arrival is close to now produces
  a nominal departure that's already in the past.** Since
  `nominalDeparture = arrival - baselineDuration`, an arrival picked
  within the trip's own baseline duration of "now" mathematically can't
  produce a future nominal departure. Detected and reported as a clear
  `"unavailable"` reason before even attempting the Google call (see
  `lib/traffic/analyzeRouteTraffic.ts`), rather than surfacing Google's
  generic rejection.
- **Traffic-aware duration genuinely varies by requested departure
  time** — confirmed live on the identical SFU Burnaby → Surrey Central
  route: a 5am departure returned a traffic-aware duration *faster* than
  `staticDuration` (24min vs. 28min), while an 8am weekday departure
  returned 30min (+2min over static). This is real evidence WinterRoute
  is genuinely querying the selected time, not returning a cached/current
  result for every request — see the "Comparison test" in
  `decisions/0006-traffic-data-pipeline.md`.
- **A negative "delay" is possible from Google's own numbers** (traffic-aware
  faster than static, as above) and is clamped to 0 rather than shown —
  confirmed with the real 5am case, not just a synthetic test.
- **`speedReadingIntervals` granularity drops off for far-future
  requests** — a 2-hour-out request returned 3 distinct intervals; the
  same route 68 hours out returned 1 (a single uniform interval).
  Consistent with far-future estimates relying more on historical
  patterns and less on anything resembling live segment-level detail —
  informal supporting evidence for, not the basis of, WinterRoute's own
  near-term/future distinction (`lib/traffic/timeline.ts`).

## DriveBC / Open511 — active road events

**What:** factual road events (construction, incidents, special events,
weather/road conditions) for British Columbia, from the Government of
BC's Open511-standard API (`https://api.open511.gov.bc.ca/events`),
queried by bounding box around the route.

**Why Open511 directly, not scraped:** DriveBC publishes a structured,
government-maintained Open511 feed specifically so this kind of
integration doesn't need to scrape a webpage — using it is both more
reliable and the responsible way to access this data.

**Discovering the API:** the exact collection/endpoint wasn't assumed —
`https://api.open511.gov.bc.ca/events` was confirmed live (200 OK,
real events returned for a Metro Vancouver bounding box), and the field
schema (`event_type`, `severity`, `status`, `schedule.intervals`,
`geography`, `roads[].direction`, etc.) was read from real event
responses and the API's help documentation, not guessed from the generic
Open511 spec.

### Route-event matching

- **Spatial:** an event is only considered relevant within 300m
  (`ROAD_EVENT_PROXIMITY_METERS`) of the route's actual geometry —
  checked point-by-point (haversine distance), not a bounding-box
  approximation. A documented, adjustable threshold, not a validated one.
- **Temporal:** `schedule.intervals` is checked against the trip's
  commute time; an event confirmed *not* to overlap is excluded (e.g. a
  9pm-start closure doesn't apply to an 8am trip). An event with no
  schedule data is *kept*, flagged `timeRelevance: "unknown"` — excluding
  it would claim certainty WinterRoute doesn't have.
- **Direction is preserved, not filtered on.** DriveBC's `roads[].direction`
  (e.g. `"NB"`, `"BOTH"`) is kept as informational metadata only.
  Reliably determining the route's *own* directionality at the matched
  point (to compare against it) isn't attempted this stage — see
  `architecture.md` "Event direction" for why guessing would be worse
  than not filtering at all.

### Known limitations discovered while integrating

- **`schedule.intervals` timestamps have no UTC offset**, unlike
  `created`/`updated` (which do, e.g. `-07:00`) — confirmed by inspecting
  real live events side-by-side. Parsed as America/Vancouver local time,
  DST-aware, without a hardcoded offset (`parseVancouverLocalDateTime` in
  `lib/traffic/roadEvents.ts`) — verified against both a summer (PDT,
  UTC-7) and winter (PST, UTC-8) date in tests.
- **The collection retains ended/expired events** rather than removing
  them (the same pattern already found in ECCC's weather-alerts
  collection) — `status` must be checked, not just presence in the
  results.
- **Coverage is not comprehensive for every local municipal street** in
  Vancouver/Burnaby/Surrey — DriveBC is provincial-highway-oriented. "No
  relevant DriveBC event found" is presented as exactly that, never as
  "no road incidents exist" — see the road events section of the traffic
  preview and `architecture.md`.
- **No API key required.**

## TransLink — GTFS static + GTFS-Realtime V3

**What:** TransLink's own scheduled-service data (GTFS static ZIP) and
three live protobuf feeds (GTFS-Realtime V3: Trip Updates, Vehicle
Positions, Service Alerts), used to enrich the `bus`/`rail` segments of a
Google-computed route with real schedule and (where published) realtime
context.

**Why GTFS-Realtime V3, not the older RTTI API:** the project brief
explicitly warned that TransLink's older RTTI (Real-Time Transit
Information) API is retired; GTFS-Realtime V3 was confirmed live as the
current, working API (all three endpoints returned real `200`/protobuf
responses during this build) before writing any integration code against
it.

**Endpoints** (confirmed live, `?apikey=` query param, protobuf
`application/octet-stream`):

| Feed | URL |
|---|---|
| Trip Updates | `https://gtfsapi.translink.ca/v3/gtfsrealtime` |
| Vehicle Positions | `https://gtfsapi.translink.ca/v3/gtfsposition` |
| Service Alerts | `https://gtfsapi.translink.ca/v3/gtfsalerts` |

**GTFS static:** `https://gtfs-static.translink.ca/gtfs/google_transit.zip`
— confirmed live, updated weekly (Fridays). Real inspected sizes:
`routes.txt` (240 rows), `trips.txt` (63,024), `stops.txt` (8,914),
`calendar.txt` (31), `calendar_dates.txt` (823), and `stop_times.txt`
(**1,844,734 rows, 91MB uncompressed**) — see `architecture.md` "GTFS
static: eager index vs. lazy scan" for how that last file is handled
without a persistent 1.84M-row in-memory index.

**Decoding:** the real, maintained `gtfs-realtime-bindings` npm package
(`^2.2.0`) — never a hand-written protobuf parser, and raw protobuf never
leaves the server (decoded into minimal typed intermediate shapes in
`lib/transit/providers/translinkRealtime.ts`).

### Request quota

**1,000 requests/day per API key** — confirmed via TransLink's own Terms
of Use, not assumed as a round-number guess. This directly set the
realtime cache TTL (5 minutes across all three feeds, worst case
864 requests/day under continuous traffic) — see "Caching and the
1,000/day quota" in `architecture.md`.

### Known limitations / behavior discovered while integrating

- **SkyTrain/rail routes have no `route_short_name` at all.** Confirmed
  live: the Expo Line's `route_short_name` is an empty string in
  TransLink's real `routes.txt`. This broke rail matching entirely in an
  initial short-name-only implementation (every rail segment came back
  `unmatched`) until a `route_long_name` fallback was added — confirmed
  live to match Google's `transitLine.longName` ("Expo Line") exactly.
  See "Google ↔ GTFS matching" in `architecture.md`.
- **Realtime coverage tracks vehicles in service, not every future
  scheduled trip.** Confirmed live: a bus trip departing in ~15 minutes
  had no Trip Update published for it at all, while a different trip on
  the identical route that had *already departed* its origin stop 64
  seconds late did have one. This is why "is realtime data available for
  this trip" is decided from actual feed presence, never an assumed time
  window (e.g. "realtime applies within 6 hours") — see "Recency is
  evidence, not an assumed cutoff" in `architecture.md`.
- **No occupancy/crowding data is published.** An initial check
  (`!= null`) falsely reported 805/805 vehicle entities having
  `occupancy_status` — caused by protobufjs returning the field's default
  value (`0`) for a genuinely absent proto2 field, not `null`/`undefined`.
  Re-checked with `Object.prototype.hasOwnProperty.call(...)` and
  `Message.toObject(entity, { defaults: false })`, both confirming 0/805
  true wire-presence for `occupancy_status` and `occupancy_percentage`,
  and empty `multiCarriageDetails` for every entity. No crowding UI was
  built, and none should be added unless this changes.
- **Confirmed-observed `ScheduleRelationship` values, live:**
  `TripDescriptor.ScheduleRelationship` — `SCHEDULED` and `CANCELED` (both
  seen in the real feed; `ADDED`/`UNSCHEDULED`/`REPLACEMENT`/`DUPLICATED`/
  `DELETED`/`NEW` are spec-legal but weren't observed). Stop-level
  `StopTimeUpdate.ScheduleRelationship` — `SCHEDULED` and `SKIPPED` both
  seen live.
- **A real end-to-end Google-vs-GTFS-Static-vs-GTFS-Realtime comparison**
  (SFU Burnaby → Production Way–University Station, Bus 145, live test):
  Google's reported segment start time and the matched GTFS static
  scheduled departure were identical to the second
  (`2026-09-26T20:26:49Z`) — unsurprising this far out, since Google's own
  transit estimate is itself schedule-based at that horizon, not evidence
  that Google and TransLink always agree. GTFS-Realtime had **no** Trip
  Update for that specific `trip_id` at request time — a genuine absence,
  not an integration bug (confirmed by directly decoding the live feed
  and searching for the trip ID by hand). No agreement was manufactured
  where the data didn't actually show any.

## Attribution

Shown on the relevant preview (`components/trip/WeatherPreview.tsx`,
`components/trip/TrafficPreview.tsx`, `components/trip/TransitPreview.tsx`)
and recorded here per each provider's terms:

> Weather forecast data: Open-Meteo.com (CC BY 4.0) — models: Environment
> and Climate Change Canada (HRDPS/RDPS), ECMWF, NOAA. Official alerts:
> Environment and Climate Change Canada.
>
> Traffic data: Google Routes. Road events: DriveBC (Government of
> British Columbia), Open511.
>
> Some of the data used in this product or service is provided by
> permission of TransLink. TransLink assumes no responsibility for the
> accuracy or currency of the Data used in this product or service.

The TransLink wording above is used verbatim (confirmed against
TransLink's current Terms of Use, `translink.ca/about-us/doing-business-
with-translink/app-developer-resources/terms-of-use`) — not paraphrased,
per their explicit requirement. No logos are used and no endorsement by
any of these organizations is implied, and WinterRoute does not use
TransLink's name/trademarks beyond this required disclaimer — this is a
student/portfolio project using their public data under its terms,
nothing more.
