# WinterRoute — Project Overview

## What it is

WinterRoute is a Canada-focused data science / data analytics project that
predicts how risky and how long someone's upcoming commute will be. It is
**not** a weather app with a nice frontend — the weather, traffic, and
transit signals exist to feed a commute prediction, not to be the product
themselves.

The question WinterRoute answers:

> Given this person's route, travel time, transportation method, weather,
> traffic, transit conditions, and other relevant factors, how difficult is
> their commute likely to be, how long might it take, and when should they
> leave?

## V1 scope

- **Geography:** Vancouver, Burnaby, Surrey. A trip may legitimately pass
  through an unsupported municipality (e.g. New Westminster) — the route
  itself should eventually be analyzed end-to-end regardless of which cities
  are officially selectable as start/end points.
- **Prediction horizon:** up to 72 hours ahead.
- **Not in scope for V1:** Canada-wide coverage, paid APIs, animated weather
  backgrounds, a fully built interface, ML models chosen for their own sake.

The architecture should not hard-code assumptions that make expanding beyond
these three cities or 72 hours difficult later — see `architecture.md`.

## User input

1. Starting location
2. Destination
3. Date/time
4. Whether that time means "arrive by" or "leave at"
5. Transportation method: walking, car, transit/bus, train, cycling (later:
   automatic multi-modal combinations like walk → bus → SkyTrain → walk)

The user is **never** asked how long their commute normally takes — the
baseline/typical journey time is calculated from route data, not self-reported.

## Core output (target shape, not yet implemented)

```
Recommended departure: 7:48 AM
Expected journey: 57-65 min
Typical journey: 43 min
Expected additional delay: +14 to +22 min
Commute Risk: 78 / 100 - High
Prediction Confidence: 89% / High

"Heavy snow is expected during the first portion of your route. Morning
road congestion and elevated bus delay risk are likely to increase your
travel time, while wind should have limited impact."
```

The numbers above are illustrative only — they describe the *shape* of the
output (ranges, a risk score, a confidence level, a short plain-language
explanation), not a target to hard-code.

For an "arrive by" trip, the recommended departure time is the primary
result — it's the action the commuter actually needs, and should carry more
visual weight than the risk score.

## Why traffic is core, not optional

Bad weather amplifies traffic congestion, collisions, slowdowns, and bus
delays. Traffic must influence both the predicted commute time and the risk
score, and different segments are affected differently: strongly for
driving and buses, much less for rail/SkyTrain, and walking has its own
distinct weather-related risk (ice, exposure) rather than a traffic risk.

## Why route-level analysis, not single-point weather

Conditions differ meaningfully along a single trip — e.g. Burnaby Mountain
vs. Downtown Vancouver. A route should eventually be broken into
geographic/transport segments (walk to stop → bus on a specific corridor →
SkyTrain → walk) with conditions evaluated per segment, rather than checking
"weather in Vancouver" once.

## Accuracy philosophy

No single weather source is trusted blindly. The long-term approach is data
fusion across multiple reliable sources (e.g. ECCC forecasts, live
observations, radar, high-resolution models, official alerts), with results
communicated as ranges and a confidence level rather than false precision.
How heavily live data vs. forecast models vs. historical data are weighted
should depend on how soon the trip is (imminent trips lean on live
observations/traffic/transit; trips near the 72h limit carry more
uncertainty and lean more on models/historicals).

## Data science requirement

This must remain a genuine pipeline: data collection → cleaning →
joining/integration → feature engineering → exploratory analysis →
prediction/scoring → uncertainty/confidence → evaluation → improvement. No
ML model gets added just so the project can claim to use ML — logic and
data-driven scoring come first; ML is adopted later only where it
demonstrably improves predictions.

A major long-term feature is storing **what WinterRoute predicted** vs.
**what actually happened**, so prediction error can be measured and the
system improved with real evaluation metrics (MAE, RMSE, calibration, etc.)
rather than an unverified accuracy claim.

## Experience direction

Three things combined, not traded off against each other:

1. Google Maps / Uber-level simplicity for entering a trip.
2. Premium weather-app atmosphere for the visual environment (dynamic,
   weather-reactive backgrounds come later — see `architecture.md` for why
   they're deferred).
3. Data-science intelligence underneath the results — the polish should not
   hide the fact that there's a real analytical pipeline behind the numbers.

The result must read as clear and understandable to an ordinary commuter,
not as a generic analytics dashboard.
