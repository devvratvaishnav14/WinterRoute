# 0001 — Project foundation and documentation structure

**Date:** 2026-09-22

## Context

WinterRoute is starting from a fresh `create-next-app` scaffold (Next.js
16.3.6, App Router, TypeScript strict, Tailwind CSS v4, `src/` directory).
The project needs to be built incrementally, stay technically defensible as
a data science project, and be documented well enough to explain in
interviews later. Before writing any feature code, the first step was to
confirm the scaffold and record an initial architecture direction.

## Decision

- Keep the scaffold as-is for now. It's a clean, unopinionated App Router
  setup and doesn't need structural changes before there's real code to
  organize.
- Introduce a `docs/` folder as the living technical record: `overview.md`
  (product scope/requirements), `architecture.md` (system design and
  rationale), and `decisions/` (this ADR log). Documentation should record
  *why*, not log every change — routine work doesn't get an entry here.
- Commit to a layered architecture (domain/config → data ingestion →
  scoring → presentation, with evaluation as a future layer) before writing
  any ingestion or scoring code, so route-segment-aware, source-swappable,
  mode-aware design isn't retrofitted later. See `architecture.md`.
- Defer all external integrations (weather, traffic, transit, maps,
  routing, database), the animated weather backgrounds, and the full
  interface to later stages, per explicit project scope for this step.

## Consequences

- No `lib/`, `components/`, or `types/` folders were created yet — they'll
  appear in later stages alongside the code that needs them, per
  `architecture.md`'s proposed layout.
- Next stage is expected to define the trip domain model (origin,
  destination, time + arrive-by/leave-at, mode) and a minimal input UI,
  still without any external data sources.
