# WinterRoute Documentation

This folder is the living technical record of WinterRoute. It exists so the
project can be explained accurately later (including in interviews), not as a
changelog of every code change.

## Contents

- [`overview.md`](./overview.md) — what WinterRoute is, who it's for, and the
  V1 scope (cities, prediction horizon, user flow, core output).
- [`architecture.md`](./architecture.md) — how the system is structured:
  layers, proposed folder layout, data pipeline shape, and how the design
  stays expandable beyond V1.
- [`data-sources.md`](./data-sources.md) — which external data sources were
  chosen, why, and what limitations were discovered integrating them.
- [`decisions/`](./decisions) — a short log of significant technical
  decisions (ADR-style: context, decision, consequences). Only decisions that
  would actually help explain *why* something is built a certain way belong
  here — not routine changes.

## How this will grow

As the project moves through stages, expect additional focused documents
rather than one giant file, for example:

- `scoring.md` — once the risk-scoring / prediction logic exists.
- `validation.md` — once predicted-vs-actual tracking and evaluation metrics
  (MAE, RMSE, calibration, etc.) are implemented.

These are intentionally not created yet — see `architecture.md` for why.
