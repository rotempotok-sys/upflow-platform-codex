# Task 002a - Supabase Postgres Relational Storage Foundation

## Goal
Define and scaffold the normalized relational storage model for app runtime data in Supabase Postgres.

## Scope
- Define core runtime entities/tables and keys for users, clients, facilities, operations, assignments, schedule entries, reports, exceptions, sync runs, raw events, and agent actions.
- Specify primary/foreign key rules and uniqueness constraints for stable joins.
- Document source ownership for each entity (Monday source-owned vs runtime-derived).

## Out of Scope
- UI migration.
- Full sync implementation.
- End-user feature behavior changes.

## Dependencies
- Task 001.

## Prerequisites
- Supabase project exists.
- Connection credentials and schema migration path are not assumed preconfigured.

## Likely Files
- `docs/codex/tasks/001-domain-contracts.md` (cross-reference updates)
- `docs/codex/roadmap.md`
- Backend schema/config files already used by this repo (no redesign)

## Validation Expectations
- Schema draft covers all critical entities and relation keys used by Team/Calendar/Reports flows.
- Key constraints are explicit enough to prevent ambiguous joins.
- Missing mandatory relation fields are handled as invalid runtime state (fail-closed), not silently defaulted.


