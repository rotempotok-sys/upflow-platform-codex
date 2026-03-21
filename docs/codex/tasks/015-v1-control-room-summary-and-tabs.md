# Task 015 - V1 Control Room Summary And Tabs

## Goal
Align the top-of-screen control room shell to the V1 operations control room spec without redesigning the full product.

## Scope
- Keep the existing Team surface.
- Enforce exactly 5 summary cards in control-room mode:
  1. Open urgent operations
  2. Open operations without technician
  3. Planned for today
  4. Overdue
  5. At-risk client/facility contexts
- Add management-state tabs (today, week, urgent, at-risk, without technician, overdue).
- Keep facility view explicitly partial when facility linkage is unresolved.

## Out Of Scope
- No modal redesign.
- No new backend schema.
- No AI workflow changes.

## Inputs
- `docs/operations_control_room_spec_he.md`
- Runtime projections + exceptions payloads already in use.

## Validation Expectations
- UI renders 5 cards only.
- Tabs are management-state based, not entity-based.
- Empty and error states remain explicit and fail-closed.
- Build passes.
