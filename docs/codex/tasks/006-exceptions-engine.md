# Task 006 - Implement Deterministic Exceptions Engine (Backend First)

## Goal
Compute operational exceptions from explicit rules and expose them to UI.

## Scope
- Add rule set for: missing technician, missing schedule link, missing calendar link, missing report, mismatch states.
- Return normalized exception objects with severity and reason code.

## Out of Scope
- Auto-remediation workflows.
- ML-based prioritization.

## Dependencies
- Tasks 002 and 005.

## Likely Files
- `vite.config.ts`
- `src/types/scheduling.ts`

## Validation Expectations
- Each exception has deterministic rule code.
- No exception relies on text heuristics as primary signal.
- Exceptions endpoint/payload remains stable under partial data.
