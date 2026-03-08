# Task 017 - V1 Control Room Operation Modal And Next Action

## Goal
Provide operation drilldown with concise rationale and deterministic recommended next action.

## Scope
- Clicking an operation opens a focused operation detail modal/panel.
- Drilldown includes:
  - operation core context
  - technician + planned datetime source (calendar/monday/missing)
  - report linkage state
  - active exceptions summary
- Add rule-based recommended next action, including cases like:
  - assign technician
  - set schedule
  - check missing report
  - resolve orphan schedule/report links
  - check repeat field visit

## Out Of Scope
- No autonomous execution.
- No generative free-form recommendations.

## Inputs
- Runtime operation/schedule/report/exception data.

## Validation Expectations
- Each row opens deterministic context.
- Recommended action is rule-based and reproducible.
- Missing linkage is explicit, not hidden.
- Build passes.
