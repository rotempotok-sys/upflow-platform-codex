# Supabase Runtime Setup and Validation

## Project Reference
- Dashboard: https://supabase.com/dashboard/project/ieaurqjieokbqnfwimii

## 1) Apply baseline schema
Run SQL from `supabase/schema/001_runtime_baseline.sql` in Supabase SQL Editor.
Run SQL from supabase/schema/002_runtime_assignments_unique.sql as well.
Run SQL from supabase/schema/003_clients_facilities_relation_ids.sql as well.

## 2) Required server env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (kept for parity/config checks)
- `SUPABASE_DB_SCHEMA` (default: `public`)

## 3) Runtime endpoints
- `GET /api/runtime-db/health`
- `GET /api/runtime-db/snapshot` (runtime read endpoint)
- `GET /api/runtime-db/sync/latest` (latest sync diagnostics)
- `GET /api/runtime-db/smoke` (health + latest sync + snapshot counts smoke check)
- `POST /api/runtime-db/sync/monday-snapshot`

## Deprecated endpoint
- `GET /api/monday/snapshot` now returns `410 API_DEPRECATED` and must be replaced with `GET /api/runtime-db/snapshot`.
## Sync diagnostics
- Response body `runtimeSyncSignature` must match the latest build marker.
- Sync response diagnostics include `runtimeSyncSignature`, `fetchedBoards`, `normalized`, `skipped`, and `persisted` counts.
- `sync_runs.metadata.diagnostics` stores the same diagnostics payload for each run.

## Security and behavior guarantees
- Endpoints are server-only and protected by existing session/auth guards.
- Sync is allowed only for `Admin` / `Operations` users.
- Errors are sanitized before logging/response; secrets/tokens are redacted.
- Fail-closed behavior is enforced for missing config and missing schema.

## Manual validation checklist

### A. Health endpoint: missing env should fail clearly
1. Remove one var temporarily (example: `SUPABASE_SERVICE_ROLE_KEY`).
2. Call `GET /api/runtime-db/health`.
3. Expected:
- HTTP `500`
- `error.code = SUPABASE_CONFIG_MISSING`
- Response includes `missingConfig` list, no secret values.

### B. Health endpoint: missing schema should fail clearly
1. Restore env vars.
2. Ensure baseline SQL was not fully applied (or use a fresh DB).
3. Call `GET /api/runtime-db/health`.
4. Expected:
- HTTP `503`
- `error.code = SUPABASE_SCHEMA_MISSING`
- Response includes missing table names only.

### C. Health endpoint: ready state
1. Apply full baseline SQL.
2. Call `GET /api/runtime-db/health`.
3. Expected:
- HTTP `200`
- `ok = true`
- `health.ready = true`

### D. Runtime snapshot endpoint
1. Login as approved user with any of `screen.assistant`, `screen.clients`, `screen.equipment`.
2. Call `GET /api/runtime-db/snapshot`.
3. Expected:
- HTTP `200`
- payload includes `clients`, `facilities`, `fetchedAt`, `source = supabase_runtime`.

### E. Sync endpoint: role guard
1. Login as approved `Technician` or `Viewer`.
2. Call `POST /api/runtime-db/sync/monday-snapshot`.
3. Expected:
- HTTP `403`
- `error.code = AUTH_PERMISSION_DENIED`

### F. Sync endpoint: success path
1. Login as approved `Admin` or `Operations`.
2. Call `POST /api/runtime-db/sync/monday-snapshot`.
3. Expected:
- HTTP `200`
- `ok = true`
- `sync.syncRunId` exists
- `sync.rowsUpserted` is numeric
- `diagnostics` includes schema and source board IDs only.

### G. Secret leakage check
1. Trigger a controlled failure (invalid Supabase key, or revoke access).
2. Check server logs and API response.
3. Expected:
- No raw tokens/JWTs/keys in logs or response
- only redacted placeholders appear.

### H. Latest sync diagnostics endpoint
1. Login as approved user with any of `screen.assistant`, `screen.clients`, `screen.equipment`.
2. Call `GET /api/runtime-db/sync/latest`.
3. Expected:
- HTTP `200`
- `ok = true`
- `source = supabase_runtime`
- `latest` is either `null` (before first sync) or includes `id`, `source`, `status`, `started_at`, `finished_at`, `rows_upserted`.

### I. Runtime smoke endpoint
1. Login as approved `Admin` or `Operations`.
2. Call `GET /api/runtime-db/smoke`.
3. Expected:
- HTTP `200`
- `ok = true`
- `smoke.health.ready = true`
- `smoke.snapshot.clients` and `smoke.snapshot.facilities` are numeric counts.



