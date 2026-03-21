# Task 004 - Replace Calendar Title Parsing with Explicit Linkage

## Goal
Migrate Calendar screen logic to explicit operation/schedule linkage from backend snapshot/projections.

## Scope
- Remove technician assignment inference from event text/title.
- Use mirrored email/linked fields from persisted runtime snapshot as authoritative filter basis.

## Out of Scope
- Rebuilding Google OAuth architecture.
- New calendar provider integration.

## Dependencies
- Task 002.

## Likely Files
- `src/features/calendar/CalendarLinkPage.tsx`
- `vite.config.ts` (if endpoint payload extension needed)

## Validation Expectations
- No primary authz/filtering logic depends on free-text event parsing.
- Technician calendar rows map to explicit linked schedule records only.
- Mismatches are visible as exceptions, not silently accepted.
