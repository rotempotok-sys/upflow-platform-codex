# Task 002c - Snapshot and Projection Storage Approach

## Goal
Define Supabase Postgres snapshot/projection storage approach for stable API reads before UI migration.

## Scope
- Specify normalized snapshot representation and version/update strategy.
- Specify projection storage for role-scoped runtime reads (`me`, team, calendar, reports).
- Specify exception and sync-run storage required for diagnostics and audit.

## Out of Scope
- Full analytics redesign.
- New frontend features.

## Dependencies
- Task 002b.

## Prerequisites
- Supabase Postgres schema and persistence boundaries are documented.
- Runtime connection assumptions remain fail-closed until verified.

## Likely Files
- `docs/codex/roadmap.md`
- Backend API/data-access files that currently serve snapshot endpoints
- `src/types/scheduling.ts` (contract alignment only)

## Validation Expectations
- API-facing projections can be built without ad-hoc source-system joins at request time.
- Snapshot/projection model supports deterministic permission scoping.
- Missing critical mapping at projection time is represented as explicit exception state (fail-closed).


