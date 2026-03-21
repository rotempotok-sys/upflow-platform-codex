# Task 002b - Define Sync Persistence Boundaries

## Goal
Establish explicit persistence boundaries between source systems, sync pipeline, and Supabase Postgres runtime state.

## Scope
- Define which fields are ingested raw, normalized, and projected.
- Define where source-of-truth updates are allowed vs prohibited.
- Define fail-closed behavior for missing critical mappings during normalization (identity, relation keys, board/column mapping).

## Out of Scope
- UI changes.
- Advanced reconciliation tooling.

## Dependencies
- Task 002a.

## Prerequisites
- Supabase schema baseline from Task 002a is defined.
- Credentials/MCP are explicitly validated in-task (not assumed).

## Likely Files
- `docs/codex/roadmap.md`
- `docs/codex/tasks/001-domain-contracts.md`
- Sync-related backend docs/config files already in repo

## Validation Expectations
- Every critical field in runtime projections has a documented origin and mapping path.
- Sync behavior for missing/ambiguous mapping is explicit: reject/flag/block (no permissive fallback).
- Boundaries prevent app runtime from becoming a second operational source of truth.


