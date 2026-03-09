# Task 010 - V1 Canonical Model Alignment

## Goal
Align runtime domain contracts and mapping inventory to the V1 canonical operational model.

## Scope
- Confirm canonical entities: operation, schedule entry, report, user, assignment, exception.
- Align operation lifecycle fields with V1 hierarchy (business status primary; secondary status explicit).
- Ensure mapping inventory explicitly captures board IDs, relation keys, mirrored identity fields, and open-state determinants.

## Out of Scope
- UI redesign.
- Broad schema migration.

## Dependencies
- Existing Task 001 artifacts.

## Likely Files
- `server/monday/mappingInventory.ts`
- `src/types/scheduling.ts`
- `docs/codex/monday-mapping-inventory.md`

## Validation Expectations
- Build passes.
- All canonical fields have explicit mapping origin in inventory.
- Missing/ambiguous critical mappings fail closed.
- Conflicts with previous model are documented explicitly.
