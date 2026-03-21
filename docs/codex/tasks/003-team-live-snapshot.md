# Task 003 - Wire Team View to Live Snapshot

## Goal
Replace static `teamData` usage in Team screen with API-driven operation/schedule data.

## Scope
- Fetch and render team workload from the Supabase Postgres-backed snapshot endpoint.
- Keep current visual structure; swap data source only.

## Out of Scope
- Full UI redesign.
- Calendar behavior changes.

## Dependencies
- Task 002.

## Likely Files
- `src/features/team/TeamOverview.tsx`
- `src/App.tsx`
- `src/types/scheduling.ts`

## Validation Expectations
- Team KPIs no longer depend on `src/data/teamData.ts`.
- Admin/Operations see full allowed set, Technician sees scoped data.
- UI handles empty/error states safely.

