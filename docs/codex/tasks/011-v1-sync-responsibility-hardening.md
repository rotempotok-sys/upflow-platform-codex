# Task 011 - V1 Sync Responsibility Hardening

## Goal
Implement canonical sync responsibilities and source ownership boundaries from V1.

## Scope
- Enforce source ownership in sync logic:
  - Monday operational fields are source-owned.
  - Calendar timing fields are truth-in-practice source-owned.
  - Supabase stores normalized runtime state and projections.
- Apply explicit runtime inclusion rules for users (valid + active + approved + relevant).
- Define canonical open-state derivation inputs for operation/schedule sync payloads.

## Out of Scope
- New UI behavior.
- Non-canonical heuristic fallbacks as primary logic.

## Dependencies
- Task 010.

## Likely Files
- `server/runtime/mondayRuntimeNormalize.ts`
- `server/runtime/sync.ts`
- `vite.config.ts` (sync diagnostics contract only)

## Validation Expectations
- Sync diagnostics include canonical field counts and skipped-reason counts.
- User sync clearly reports dropped rows by rule.
- Missing critical lifecycle/linkage fields produce fail-closed behavior.
- Manual sync run confirms deterministic persisted counts.
