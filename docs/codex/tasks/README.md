# Codex Task Index

## V1 Canonical Execution Order (Smallest Safe Slice)
1. `010-v1-canonical-model-alignment.md`
2. `011-v1-sync-responsibility-hardening.md`
3. `012-v1-runtime-projections.md`
4. `013-v1-exceptions-canonical-rules.md`
5. `014-v1-ui-wiring-canonical-projections.md`
6. `015-v1-control-room-summary-and-tabs.md`
7. `016-v1-control-room-operations-queue.md`
8. `017-v1-control-room-operation-modal-and-next-action.md`
9. `018-v1-control-room-role-scope-hardening.md`

## Existing Tasks (Reference / Legacy Sequence)
1. `001-domain-contracts.md`
2. `002a-postgres-relational-foundation.md`
3. `002b-sync-persistence-boundaries.md`
4. `002c-snapshot-projection-storage.md`
5. `002-operations-snapshot-api.md`
6. `003-team-live-snapshot.md`
7. `004-calendar-explicit-linkage.md`
8. `005-reports-projection.md`
9. `006-exceptions-engine.md`
10. `007-operations-control-view.md`
11. `008-ai-context-regrounding.md`
12. `009-validation-observability.md`

## Validation Gate
- Do not start the next task until current task validation expectations pass.
- Prefer runtime checks against live snapshot/sync diagnostics, not assumptions.

## Escalation Rule
If blocked after 1-2 iterations, consult external references (official docs/vendor APIs), capture findings, then continue.
