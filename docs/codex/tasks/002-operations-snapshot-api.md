# Task 002 - Add Operations Snapshot Endpoint

## Goal
Implement guarded backend endpoint that returns normalized operations + schedule + report linkage from Supabase Postgres runtime storage.

## Scope
- Add endpoint in Vite middleware.
- Query runtime snapshot/projection tables built from Monday operational data.
- Build explicit join model using mapped identifiers/relations.

## Out of Scope
- Frontend migration.
- Exception scoring/ranking UI.

## Dependencies
- Task 001.
- Task 002a.
- Task 002b.
- Task 002c.

## Likely Files
- `vite.config.ts`
- `server/auth/guards.ts` (reuse only)
- `src/types/scheduling.ts`

## Validation Expectations
- Endpoint requires approved session and permission checks.
- Technician receives scoped rows only.
- Missing required join/mapping data returns explicit safe error or exception flag (fail-closed).
- Manual API check with `curl` shows stable JSON schema.

