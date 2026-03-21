# Task 001 - Define Shared Domain Contracts

## Goal
Create operation/schedule/report/exception type contracts aligned to current app architecture.

## Scope
- Add/extend TS types under `src/types/*` for new normalized entities.
- Create centralized mapping inventory for Monday board IDs, column IDs, mirrored identity fields, and relation keys required by downstream tasks.
- Document critical mapping assumptions and fail-closed expectations.

## Out of Scope
- New UI screens.
- New API endpoint behavior.

## Dependencies
None.

## Likely Files
- `src/types/scheduling.ts`
- `vite.config.ts` (types only, if needed)
- `docs/codex/tasks/001-domain-contracts.md` (mapping inventory notes)

## Validation Expectations
- `npm run build` passes.
- Types compile with no `any` expansion for new entities.
- Contract includes explicit identity/scope fields needed for role-based filtering.
- Mapping inventory includes all critical board/column/relation identifiers required for sync and projection logic.
- Missing mandatory mapping paths are documented as fail-closed conditions.
