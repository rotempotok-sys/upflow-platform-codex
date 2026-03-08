# Task 009 - Validation and Operational Observability Pass

## Goal
Add minimal diagnostics and finalize rollout validation across implemented tasks.

## Scope
- Ensure API logs include endpoint-level error reason codes.
- Add/update docs with runbook validation steps.
- Verify permission scoping on all migrated surfaces.

## Out of Scope
- Full monitoring platform integration.
- End-to-end test framework adoption.

## Dependencies
- Tasks 002-008.

## Likely Files
- `vite.config.ts`
- `README.md`
- `docs/codex/roadmap.md`
- `docs/codex/tasks/*.md` (status notes)

## Validation Expectations
- For each migrated endpoint/screen, manual checklist is executed and recorded.
- At least one blocked-path scenario is validated (unauthorized, missing mapping, ambiguous join).
- Team knows when to pause and consult external references after 1-2 failed iterations.
