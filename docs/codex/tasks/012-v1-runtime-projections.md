# Task 012 - V1 Runtime Projections (Technician/Facility/Operation/Daily-Weekly)

## Goal
Create canonical runtime projections required by V1 for operational control surfaces.

## Scope
- Define projection shapes for:
  - Technician view
  - Facility view
  - Operation view
  - Daily/weekly control view
- Move open/closed logic to canonical projection layer (not ad-hoc UI heuristics).
- Ensure server-side scope filtering consumes projection entities directly.

## Out of Scope
- New visual design.
- AI behavior changes.

## Dependencies
- Task 011.

## Likely Files
- `server/runtime/read.ts`
- `vite.config.ts` (`/api/runtime-db/snapshot` and related runtime endpoints)
- `src/types/scheduling.ts`

## Validation Expectations
- Projection payloads are deterministic and typed.
- Scoped users receive only authorized projection rows.
- Projection includes explicit source metadata and fetchedAt/sync markers.
- No request-time free-text parsing for canonical joins.
