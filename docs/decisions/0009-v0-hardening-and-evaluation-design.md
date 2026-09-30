# 0009 — V0 hardening (prediction availability) + evaluation-dataset design

**Date:** 2026-09-27

## Context

Before building expected-commute-duration prediction or a recommended
departure, this stage does two things: (1) fixes semantic weaknesses in
the V0 experimental risk index — most importantly, that an absence of
evidence could read identically to a confirmed low-risk result — and (2)
designs (types + dev tooling only, no persistence) the data structures
needed to eventually compare a WinterRoute prediction against a real
observed outcome. Deep rationale for individual mechanisms lives in
`docs/architecture.md` "V0 hardening" and "Prediction-evaluation
architecture"; this records the decisions, two real bugs found during
this stage, and the required documentation the brief asked for in one
place.

## Part 1 — Fixing "no data == Low"

### Decision: `RiskPredictionStatus`, computed from mode-aware essential-factor sufficiency

`"available" | "limited-data" | "insufficient-data"`
(`lib/scoring/sufficiency.ts`). A route's essential factors are the union
of `config.sufficiency.essentialFactorsByMode` across every distinct
segment mode it actually contains (walk/cycle → weather; drive → weather
+ traffic; bus/rail → transit). `"insufficient-data"` only when NONE of
those essential factors could be scored — not simply "some provider
failed." `overallIndex`/`label` are still computed unconditionally (kept
as a plain bounded number for internal consistency/debugging), but
`RiskPreview.tsx` now gates what it displays on `predictionStatus`, never
on the index value itself.

### Decision: forecast-horizon-awareness needs no separate rule

A far-future transit trip with no realtime update yet was already
`"scored"` (not `"unavailable"`) at the factor level, from the transit
stage's own "no update ≠ on time" design (`matched-schedule-only` is
valid evidence). Sufficiency inherits this for free — no bolt-on
"if horizon > N hours, treat as normal" rule was needed or added. Verified
live: a real 20-hour-out SFU→Production Way transit request correctly
returned `transit: { status: "scored", score: 0 }`.

### Decision: `overallIndex` stays a plain number; the UI, not the type, enforces "don't show it"

Considered representing "insufficient" as `null`/`NaN`/a sentinel value
instead. Rejected — the quality gate explicitly requires the score stay
"bounded 0-100, never NaN," and conflating "no defensible score" with an
invented numeric encoding would just move the fabrication into the type
system. Instead, `predictionStatus` is a first-class sibling field, and
`RiskPreview.tsx` checks it before ever rendering `overallIndex`.

## Part 2 — Validation harness

### Decision: a 33-scenario matrix, synthetic features only, two consumers

`lib/scoring/scenarios.ts` — covering clear/normal (per mode),
rain/snow (three intensities each), freezing, wind (two levels), traffic
(three levels), six transit-disruption states, three road-event
severities, four provider-failure combinations, and four mixed-conditions
cases. Consumed by `scenarios.test.ts` (automated invariants: bounded/
non-NaN, valid `predictionStatus`, real index spread, sensible per-category
ordering) and `scripts/riskScenarios.ts` (a `npm run scenarios`
development CLI printing full results for manual inspection — not a
user-facing dashboard, per the explicit instruction).

### Decision: boundary tests at every threshold's exact edge

`labelFor` (exported specifically for this) tested at 29/29.9/30,
54/54.9/55, 74/74.9/75; `scoreOnCurve`/`scoreOnInverseCurve` tested at
their exact `lowValue`/`highValue` and just inside/outside. This is
specifically to catch a `<` vs `<=` mistake, which would otherwise only
show up as a hard-to-notice discontinuity.

## Two real bugs found while building this stage

1. **The cancellation floor could be undercut by an extreme delay.**
   `canceledTripScore` was 92; `transit.delayCurve` saturates at 100 for
   any delay ≥ 15 minutes. A "major delay" scenario in the matrix
   (originally 900s/15min, exactly the curve's own ceiling) scored 100 —
   higher than an actual cancellation. Fixed by raising
   `canceledTripScore` to 100 (the curve's own maximum), so a
   cancellation can never be scored at or below what a mere delay can
   reach, however extreme. Caught by the scenario matrix's own
   category-ordering test (`scenarios.test.ts`), not by inspection —
   exactly the kind of thing this stage's harness was built to surface.
2. **A defensive secret-scanner false-positived on a legitimate field
   name.** `devExport.ts`'s "refuse to export anything that looks like a
   secret" check originally used `/key|secret|token|password|credential/i`
   — which matched `FactorContribution.key` (a real, legitimate field
   identifying which contributor a score came from, e.g. `"delay"`,
   `"snowfall"`), making the export utility unusable for any snapshot
   with factor contributions (i.e., almost all of them). Fixed by
   requiring compound secret-like terms (`apikey`, `api_key`, `secret`,
   `token`, `password`, `credential`) rather than the bare substring
   `key`. Caught immediately by `devExport.test.ts`'s round-trip test,
   not by inspection.
3. **(Test-quality, not product) A privacy test used too short a
   substring.** An early version of `privacy.test.ts` checked that a
   redacted snapshot's JSON didn't contain the literal string `"Start"`
   (the test fixture's default origin label) — which false-positived
   against the unrelated field name `routeStartTime`. Fixed by using a
   deliberately distinctive test label instead of relying on substring
   search against a short, common word. Recorded because it's a genuine
   lesson about test fragility, not just a product bug.

## Part 3 — Evaluation dataset design (types + dev tooling only)

### PredictionSnapshot: what it stores, and why not more

Stores the full engineered `CommuteFeatureSet`, factor scores/weighting/
contributions, the overall index/label/`predictionStatus`/`sufficiency`/
`dataCoverage`, `modelVersion`, `configFingerprint`, source-freshness
metadata (model counts, sample counts, recency, transit feed
timestamps), and which providers were consulted. Deliberately does NOT
store raw Google/Open-Meteo/GTFS/DriveBC responses — the already-normalized
feature snapshot is what makes reproducibility possible without needing
them, and it's what keeps a stored prediction small (a real snapshot
serializes to a few KB, not the tens-to-hundreds of KB a raw GTFS/weather
response would add).

### Model versioning and config fingerprint policy

`modelVersion` (currently `"winterroute-risk-v0"`) is the coarse
version — any future scoring change that materially alters outputs must
mint a new one, never silently reinterpret historical scores under the
same name. `computeConfigFingerprint` (`lib/scoring/configFingerprint.ts`)
adds finer-grained traceability within a model version: a deterministic
(explicitly non-cryptographic — a stable djb2 hash over sorted-key JSON)
fingerprint of the exact `riskModelV0Config` used. Two predictions with
the same `modelVersion` but different fingerprints used different
thresholds/weights; `checkReproducibility` uses this directly to
distinguish "the scoring model changed" from "the provider data changed"
for the same historical feature snapshot.

### Reproducibility mechanism

Enabled by extracting `scoreFeatures` (`lib/scoring/computeCommuteRisk.ts`)
as the pure core of `computeCommuteRisk` — it takes an already-built
`CommuteFeatureSet` directly, with no dependency on Route/weather/
traffic/transit raw data. `reevaluateSnapshot` calls it against a stored
snapshot's own `featureSnapshot`; no provider is ever refetched for this.

### CommuteOutcome and provenance

Every field on `CommuteOutcome` is optional and independently
provenance-tagged (`ProvenancedValue<T>`, provenance one of
`"provider-observed" | "user-reported" | "derived" | "unavailable"`) —
an eventual user-reported arrival time is never conflated with an
officially-observed weather reading. `assessOutcomeCompleteness` derives
`"none"`/`"partial"`/`"complete"` from which fields are actually present,
never assumed from the record's mere existence. **No user-facing survey
or form exists to collect any of this** — per the explicit instruction,
this stage is architecture only.

### Privacy-mindful design for a FUTURE stored record

`CommuteFeatureSet` already carries no raw coordinates anywhere — that
was already true from the previous stage's feature-engineering design,
not something added here. The two location LABELS
(`originLabel`/`destinationLabel`) are the only remaining potentially
identifying fields (an exact typed-in address). `toStorableSnapshot`
drops them entirely in favor of `routeCharacteristics` (distance,
duration, segment/mode composition) for a FUTURE persisted record. This
explicitly does NOT change the live, functioning routing system —
`ResolvedLocation` still needs and keeps exact coordinates for actual
routing; the tradeoff (losing the human-readable label, in exchange for
never needing to store one) only applies at the future evaluation-storage
boundary, which doesn't exist yet either.

### Development export

`exportSnapshotAsJson` defaults to the redacted (`toStorableSnapshot`)
shape and defensively refuses to export any object with a
secret-looking field name (see "bugs found" above for the false-positive
this caught and fixed during development). Surfaced as a button inside
`RiskPreview.tsx`'s existing expandable dev-detail panel — not a
prominent user-facing feature.

### Future evaluation metrics (documented, not implemented)

The V0 index isn't a travel-time prediction or a probability, so its
eventual validation is about ranking/severity, not point accuracy:
Spearman rank correlation between index and observed disruption
severity; a confusion matrix/precision-recall only if discrete outcome
categories are later defined; calibration only if outputs are ever
converted to probabilities (not planned); evaluated separately by mode,
forecast horizon, and weather condition. Nothing here is implemented —
it requires real `CommuteOutcome` data that doesn't exist yet.

## No database, no ML, no expected-duration model, no recommended departure

All explicitly out of scope for this stage and not touched: no
Postgres/Supabase/SQLite/Firebase was introduced; `lib/evaluation/`
defines types, serialization, and dev-only fixtures only.

## Bus fullness / crowding

Continues to be entirely absent from V1 — not reintroduced into
`PredictionSnapshot`, `CommuteOutcome`, `CommuteFeatureSet`, or any
future delay-model input list. The original investigation remains
documented (`docs/decisions/0007-transit-data-integration.md`,
`docs/decisions/0008-risk-model-v0.md`) as historical project reasoning,
per the explicit instruction to preserve it rather than delete it.

## Consequences

- `docs/architecture.md` gained "V0 hardening: prediction availability,
  not just severity" and "Prediction-evaluation architecture" sections,
  and its "Explicitly deferred"/"Open questions" sections were updated.
- `ExperimentalCommuteRiskV0` gained `predictionStatus`, `sufficiency`,
  and `configFingerprint`; `RiskPreview.tsx` now has three distinct
  render paths (available / limited-data / insufficient-data) instead of
  one.
- Next stage's natural scope, per the project brief's own sequencing, is
  still NOT expected-duration prediction or recommended departure — a
  defensible next step is either beginning to design the actual
  persistence choice and outcome-collection UX this ADR describes only
  conceptually, or continuing to validate V0 against more live scenarios
  before building anything on top of it.
- Verified with the full test suite (551 tests passing, including 33
  scenario-matrix cases, sufficiency tests for every documented
  availability/limited/insufficient case, boundary tests at every
  threshold, and full round-trip/reproducibility/privacy/provenance
  coverage for the new evaluation types), `next lint`, `tsc --noEmit`,
  `next build`, and live verification against real weather/traffic/
  transit APIs (including the specific "transit tomorrow without
  realtime" case) — see the conversation's final report for the full
  results.
