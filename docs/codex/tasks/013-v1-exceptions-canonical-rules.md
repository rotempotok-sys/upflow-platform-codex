# Task 013 - V1 Exceptions Canonical Rules

## Goal
Implement deterministic exceptions based on V1 canonical entities and projection states.

## Scope
- Define exception rules for missing/ambiguous/mismatched operation-schedule-report relationships.
- Include canonical identity mismatch checks (technician linkage via explicit mirrors/relations).
- Persist and expose exception records as runtime diagnostics.

## Out of Scope
- Automated remediation workflows.
- UX redesign of exception dashboards.

## Dependencies
- Task 012.

## Likely Files
- `server/runtime/*` (exceptions computation and persistence)
- `src/types/scheduling.ts`
- `vite.config.ts` (exceptions read endpoint wiring)

## Validation Expectations
- Every exception row has deterministic code + severity + entity linkage.
- Exception computation is reproducible for the same snapshot.
- Missing critical mappings result in explicit exception output or fail-closed response.
- Manual checks verify at least one intentional negative path.
