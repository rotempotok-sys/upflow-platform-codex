# Task 005 - Add Reports API Projection and View Wiring

## Goal
Provide report visibility aligned with role/scope and connect it to frontend reporting surface.

## Scope
- Expose report-centric projection from backend snapshot data.
- Add or wire report table/view in frontend.

## Out of Scope
- Complex analytics.
- Cross-system billing integrations.

## Dependencies
- Task 002.

## Likely Files
- `vite.config.ts`
- `src/App.tsx`
- `src/types/scheduling.ts`
- `src/features/*` (new or existing report feature)

## Validation Expectations
- Admin/Operations can view all allowed reports.
- Technician sees reports where mirrored technician email matches session identity.
- Missing critical linkage is explicit in row state.
