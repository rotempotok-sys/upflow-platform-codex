# Task 014 - V1 UI Wiring to Canonical Projections

## Goal
Wire existing UI surfaces to canonical runtime projections without broad redesign.

## Scope
- Team screen consumes operation/technician canonical projection.
- Calendar screen consumes schedule projection with explicit linkage only.
- Operations control view wiring remains incremental and role-safe.
- Preserve existing visual language; focus on data contract wiring and safe states.

## Out of Scope
- Full UX overhaul.
- AI feature expansion.

## Dependencies
- Tasks 010-013.

## Likely Files
- `src/App.tsx`
- `src/features/team/TeamOverview.tsx`
- `src/features/calendar/CalendarLinkPage.tsx`
- `src/types/scheduling.ts`

## Validation Expectations
- Screens render canonical projection data for authorized users.
- Empty/error/unauthorized states are explicit and safe.
- No UI-primary heuristics where canonical projection field exists.
- Manual role checks validate Admin/Operations vs Technician scope behavior.
