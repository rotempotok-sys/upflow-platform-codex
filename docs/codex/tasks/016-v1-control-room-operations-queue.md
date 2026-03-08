# Task 016 - V1 Control Room Operations Queue

## Goal
Make the primary list an operation-first action queue as defined by the control-room spec.

## Scope
- Default center list must be operations queue.
- Each operation row must expose:
  - operation title
  - client
  - technician
  - status
  - planned date/datetime
  - next action
- Sort by operational priority:
  1. urgent
  2. overdue
  3. without technician
  4. missing report
  5. regular

## Out Of Scope
- No new exception rules.
- No full-page visual redesign.

## Inputs
- Runtime operation projection
- Runtime schedule projection
- Runtime exceptions projection

## Validation Expectations
- Queue default is operation-first.
- Priority order is deterministic and testable.
- No raw exception dump as the main list.
- Build passes.
