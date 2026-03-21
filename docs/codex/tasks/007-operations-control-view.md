# Task 007 - Add Operations Control View

## Goal
Introduce a single operation lifecycle control view powered by snapshot + exceptions.

## Scope
- Add operations control screen in app navigation.
- Render key lifecycle fields (assignment, scheduling, calendar, report, QA, exceptions).

## Out of Scope
- Large design refresh.
- Bulk-edit workflow builder.

## Dependencies
- Tasks 002 and 006.

## Likely Files
- `src/App.tsx`
- `src/App.css`
- `src/features/operations/*` (new)
- `src/types/scheduling.ts`

## Validation Expectations
- Rows are operation-centric and link-backed.
- Screen works with existing permission model.
- Error/empty/loading states are explicit.
