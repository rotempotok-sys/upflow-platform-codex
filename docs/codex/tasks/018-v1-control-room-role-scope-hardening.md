# Task 018 - V1 Control Room Role Scope Hardening

## Goal
Enforce role-scoped control-room behavior for operations manager vs technician.

## Scope
- Operations manager: full control-room visibility.
- Technician: only own relevant operation workload (today/week/overdue/action-needed).
- Keep permission filtering server-first and fail-closed.
- Keep facility-related context explicitly partial if linkage is unresolved.

## Out Of Scope
- No auth model redesign.
- No new permission source.

## Inputs
- Existing auth guard and runtime scope behavior.
- Control room spec role intent.

## Validation Expectations
- Technician cannot see global queue.
- Manager retains full queue visibility.
- Unauthorized scope returns safe empty/error response.
- Build passes.
