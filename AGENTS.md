# AGENTS.md

## Purpose
This file defines persistent execution rules for Codex contributors in this repository.
It does not define one-off implementation plans.

## Product Context (Current State)
- Frontend: React + TypeScript (`src/*`)
- API layer: Vite middleware in `vite.config.ts`
- Auth/Authz: implemented in `server/auth/*` using Monday-backed identity + scoped permissions
- Live snapshot today: clients + equipment (`/api/runtime-db/snapshot`)
- Team and calendar flows are partially legacy/mock and must be migrated incrementally
- A Supabase account and project have been created.
- Supabase Postgres is the intended app runtime database.
- Do not assume schema, credentials, or MCP integration are configured yet.
- Any Supabase integration work must stay incremental: first planning, then schema, then connection, then sync.

## Core Principles
1. Monday is the operational source of truth; app data should be derived from explicit board fields.
2. Google Sheets is an ops/staging/control layer (inbox, manual review, reconciliation), not the runtime source for app visibility or authz joins.
3. Supabase Postgres is the app runtime database for normalized snapshot, projections, exceptions, sync metadata, and audit history.
4. Do not replace Monday workflows; add a control/visibility layer on top.
5. Enforce visibility and permissions server-side first, then UI.
6. Fail closed on missing/ambiguous identity, scope, mappings, or joins.
7. Do not rely on free-text parsing as the primary linkage mechanism.
8. Keep changes modular and incremental; avoid full redesigns.

## Authoritative Sources by Layer
- Operational truth (source systems): Monday boards
- Ops staging/control workflows: Google Sheets
- Runtime application state and query layer: Supabase Postgres
- Auth + role + toggles + scope assignments: Employees/Auth board (`1729562303`)
- Operations control: Operations board (`1798247340`)
- Schedule and execution: Employees Schedule board (`1783389345`)
- Reports/QA: Reports board (`1282241018`)
- Calendar: scheduling surface only, not primary truth

## Mandatory Engineering Rules
- Build API contracts first for new business flows; UI must consume typed API payloads.
- Any technician/user scoping must use explicit email/relations fields (e.g., mirrored lookup columns), not title matching.
- New screens must degrade safely: empty/error/auth states only, never synthetic full fallback for unauthorized users.
- Keep PR/task size reviewable (single concern, clear validation, low blast radius).
- Reuse existing auth guards and permission model (`requireApprovedPermissions`, `permissions.ts`) before adding new access logic.
- Preserve existing design language unless task explicitly requests visual changes.

## Delivery Pattern
1. Read spec/docs and existing code paths.
2. Implement smallest viable backend slice.
3. Validate contract + permission behavior.
4. Migrate one UI surface.
5. Add exception handling and observability.

## Blocker Policy
If blocked after 1-2 implementation iterations (schema mismatch, integration ambiguity, platform constraints), consult external references (official docs/vendor APIs) before continuing.
Record what was checked and what decision was taken.

## Definition of Done (Per Task)
- Code compiles and app builds.
- Access control behavior is explicit and tested manually.
- Failure modes are fail-closed and user-visible.
- Contract and mapping assumptions are documented in task/PR notes.
# Security rules for this project

- Supabase credentials are configured locally via environment variables only.
- Never print, echo, log, summarize, commit, or hardcode any secret values.
- Never add real credentials to `.env.example`, source files, markdown docs, commits, or chat responses.
- Use only the variable names below when needed:
  - `SUPABASE_URL`
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_SERVICE_ROLE_KEY`
- If any required secret is missing, stop and report only the missing variable name.
- Do not modify `.env`, `.env.local`, `.env.production`, or secret-bearing config files unless explicitly instructed.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code under any circumstance.
- Any Supabase write operation must be server-side only.
- Prefer read-only access for MCP and diagnostics unless a task explicitly requires writes.
- Before any schema or data-changing operation, explain the intended change briefly and keep scope minimal.
- Redact secrets from logs, error messages, screenshots, and debug output.
- If a secret is suspected to be exposed, stop and instruct the user to rotate it before continuing.

