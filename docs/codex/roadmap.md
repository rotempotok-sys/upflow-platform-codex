# Codex Roadmap

## Scope
Translate the system specs into incremental execution for the existing `upflow-platform/app` codebase.
No full rewrite. No platform migration in this phase.

## Prerequisites (Current)
- A Supabase account and project exist.
- Supabase Postgres is the intended app runtime database.
- Schema, credentials, and MCP integration are not assumed configured and must be validated explicitly.

## Epic 1: Domain Contracts and Mapping Inventory
Goal: define typed contracts, board/column/relation mapping inventory, and critical mapping assumptions.
Dependencies: none.

### Deliverables
- Shared TS/domain types for operations, schedule, reports, exceptions, sync metadata.
- Centralized mapping inventory for Monday board IDs, column IDs, mirrored identity fields, and relation keys.
- Explicit fail-closed mapping policy for missing/ambiguous critical fields.

## Epic 2: Supabase Postgres Runtime Storage Foundation
Goal: introduce the Supabase Postgres runtime database foundation before any UI migration.
Dependencies: Epic 1.

### Deliverables
- Initial relational schema plan for normalized core entities and sync metadata tables.
- Migration/bootstrap strategy aligned with current backend patterns.
- Read/write ownership rules: Monday operational truth, Sheets ops staging/control, Supabase Postgres runtime store.

## Epic 3: Sync Persistence Boundaries
Goal: define and implement where data is persisted, where it is derived, and what remains source-owned.
Dependencies: Epic 2.

### Deliverables
- Persistence boundary contract for ingest vs normalized snapshot vs projections.
- Guardrails for what is never authored in app runtime (source-owned fields).
- Fail-closed behavior when required mappings are missing or ambiguous during sync.

## Epic 4: Snapshot and Projection Storage
Goal: establish deterministic snapshot/projection storage approach in Supabase Postgres for API consumption.
Dependencies: Epic 3.

### Deliverables
- Snapshot tables/versioning strategy for operation-centric runtime reads.
- Projection storage approach for role/scoped views (`me`, team, calendar, reports).
- Exception and sync-run persistence model for diagnostics and auditability.

## Epic 5: Operations Snapshot API (Supabase Postgres-Backed)
Goal: expose guarded endpoints from Supabase Postgres snapshot/projections with explicit scoping.
Dependencies: Epic 4.

### Deliverables
- Guarded endpoint(s) for operations + schedule + report linkage from persisted runtime state.
- Server-side scope filtering (Admin/Operations vs Technician).
- Stable fail-closed API responses for unresolved joins/mappings.

## Epic 6: Team + Calendar Migration
Goal: replace legacy/mock behavior with API-backed data and explicit linkage.
Dependencies: Epic 5.

### Deliverables
- Team view powered by snapshot API.
- Calendar view using explicit linked fields (not title parsing).
- Clear mismatch/exception indicators.

## Epic 7: Reports + Exceptions Views
Goal: expose execution/reporting quality and operational gaps.
Dependencies: Epics 5-6.

### Deliverables
- Report visibility by role/scope.
- Exceptions queue from deterministic rules.
- Operational statuses aligned with spec semantics.

## Epic 8: Operations Control and AI Context Hardening
Goal: central control surface and better AI grounding on trusted runtime data.
Dependencies: Epics 5-7.

### Deliverables
- Operations Control screen (operation lifecycle table).
- AI context generation from Supabase Postgres snapshot/projections, not legacy mock task arrays.
- Reduced ambiguity and better auditability in generated answers.

## Epic 9: Observability and Validation Coverage
Goal: make failures diagnosable and rollouts safe.
Dependencies: all previous epics.

### Deliverables
- Sync/error telemetry and reason codes in API logs.
- Task-level validation checklist execution.
- Documentation updates in `README.md` and `docs/codex/tasks` notes.

## Dependency Order (Recommended)
1. Epic 1
2. Epic 2
3. Epic 3
4. Epic 4
5. Epic 5
6. Epic 6
7. Epic 7
8. Epic 8
9. Epic 9

## Notes
- Keep each implementation step small and reviewable.
- If blocked after 1-2 iterations, consult external references and continue with explicit assumptions.
