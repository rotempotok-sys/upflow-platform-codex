# Codex Roadmap (V1 Operational Model Aligned)

## Source of Truth
This roadmap is derived from:
- `docs/upflow_operational_model_v1_he.md` (canonical V1 model)
- `docs/upflow_monday_system_spec.md`
- `docs/upflow_information_system_blueprint_he.md`
- `docs/operations_control_room_spec_he.md` (V1 control-room UI spec)
- `AGENTS.md`

## Constraints
- Monday = operational source of truth.
- Google Calendar = schedule truth in practice.
- Supabase Postgres = runtime application database.
- No architecture redesign unless a direct V1 conflict requires correction.
- Implement incrementally, one scoped backend-first task at a time.

## Known V1 Conflicts To Resolve Incrementally
1. Operation lifecycle primary status in V1 is business status (`color_mkngxc3y`), while parts of runtime still rely on secondary status fields.
2. V1 requires canonical `is_open` from operation + schedule state composition, while current runtime/UI still use partial heuristics.
3. V1 user inclusion rules require valid+active+approved+relevant users; current sync behavior still needs explicit canonical gating.
4. V1 daily/weekly control projections are required for technician/facility/operation views and are only partially implemented.
5. Control room behavior is currently spread across mixed widgets; V1 requires an operation-first control-room flow.

## V1 Execution Epics

### Epic A: Canonical Model Alignment
Goal: align runtime contracts and mappings with V1 canonical entities and lifecycle semantics.

### Epic B: Sync Responsibility Hardening
Goal: enforce explicit source ownership and deterministic sync rules, including fail-closed behavior.

### Epic C: Runtime Projections
Goal: provide canonical runtime projections for technician, facility, operation, and daily/weekly control.

### Epic D: Exceptions Engine
Goal: compute deterministic operational exceptions from canonical model states.

### Epic E: UI Wiring (Incremental)
Goal: wire existing screens to canonical projections with explicit empty/error/auth handling.

### Epic F: Operations Control Room (V1 UI Intent)
Goal: align Team/Operations surface to the control-room spec with action-first UX and role-scoped behavior, without broad redesign.

## Smallest Safe Implementation Order
1. `010-v1-canonical-model-alignment.md`
2. `011-v1-sync-responsibility-hardening.md`
3. `012-v1-runtime-projections.md`
4. `013-v1-exceptions-canonical-rules.md`
5. `014-v1-ui-wiring-canonical-projections.md`
6. `015-v1-control-room-summary-and-tabs.md`
7. `016-v1-control-room-operations-queue.md`
8. `017-v1-control-room-operation-modal-and-next-action.md`
9. `018-v1-control-room-role-scope-hardening.md`

## Validation Gate
- Do not start the next task before current task validation expectations pass.
- If blocked after 1-2 iterations, consult external references and record the decision.
