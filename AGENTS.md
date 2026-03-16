# AGENTS.md

## Purpose
This file defines persistent execution rules for Codex contributors in this repository.
It does not define one-off implementation plans.

## Product Context (Current State)
- Frontend: React + TypeScript (`src/*`)
- API layer: Vite middleware in `vite.config.ts`
- Auth/Authz: implemented in `server/auth/*` using Google OAuth2 Authorization Code Flow + Monday-backed role/permissions
- Google OAuth: unified login — single sign-in grants profile + calendar access; refresh tokens stored in Supabase (`google_oauth_tokens`)
- Calendar: dual access model — users with OAuth tokens use Google Calendar API directly; technicians without calendar access use backend Service Account endpoint (`/api/calendar/my-events`)
- Live snapshot today: clients + equipment (`/api/runtime-db/snapshot`)
- Team and calendar flows are partially legacy/mock and must be migrated incrementally
- A Supabase account and project have been created.
- Supabase Postgres is the intended app runtime database.
- Do not assume schema, credentials, or MCP integration are configured yet.
- Any Supabase integration work must stay incremental: first planning, then schema, then connection, then sync.

## Core Principles
1. Monday is the operational source of truth; app data should be derived from explicit board fields.
2. Google Sheets is an ops/staging/control layer (inbox, manual review, reconciliation), not the runtime source for app visibility or authz joins.
3. Supabase Postgres is the app runtime database for normalized snapshot, projections, exceptions, sync metadata, and audit history.
4. Do not replace Monday workflows; add a control/visibility layer on top.
5. Enforce visibility and permissions server-side first, then UI.
6. Fail closed on missing/ambiguous identity, scope, mappings, or joins.
7. Do not rely on free-text parsing as the primary linkage mechanism.
8. Keep changes modular and incremental; avoid full redesigns.
9. Google OAuth tokens (refresh/access) are managed server-side only; never store OAuth tokens in localStorage or client-side state.

## Authoritative Sources by Layer
- Operational truth (source systems): Monday boards
- Ops staging/control workflows: Google Sheets
- Runtime application state and query layer: Supabase Postgres
- Auth + role + toggles + scope assignments: Employees/Auth board (`1729562303`)
- Operations control: Operations board (`1798247340`)
- Schedule and execution: Employees Schedule board (`1783389345`)
- Reports/QA: Reports board (`1282241018`)
- Calendar: scheduling surface only, not primary truth

## Mandatory Engineering Rules
- Build API contracts first for new business flows; UI must consume typed API payloads.
- Any technician/user scoping must use explicit email/relations fields (e.g., mirrored lookup columns), not title matching.
- New screens must degrade safely: empty/error/auth states only, never synthetic full fallback for unauthorized users.
- Keep PR/task size reviewable (single concern, clear validation, low blast radius).
- Reuse existing auth guards and permission model (`requireApprovedPermissions`, `permissions.ts`) before adding new access logic.
- Preserve existing design language unless task explicitly requests visual changes.

## Delivery Pattern
1. Read spec/docs and existing code paths.
2. Implement smallest viable backend slice.
3. Validate contract + permission behavior.
4. Migrate one UI surface.
5. Add exception handling and observability.

## Monday.com MCP — כלים זמינים לאינטגרציה (`@mondaydotcomorg/monday-api-mcp@latest`)

### קריאה (חופשי — ללא אישור)
| Tool | שימוש באפליקציה |
|------|------------------|
| `get_board_info` | סכמת בורד + עמודות — בסיס ל-sync mappings |
| `get_board_schema` | סכמה מלאה — לוידוא column IDs לפני כתיבה |
| `get_board_items_page` | שליפת פריטים עם פילטרים — runtime sync |
| `get_full_board_data` | כל נתוני הבורד — snapshot/bulk sync |
| `get_board_activity` | לוג פעילות — audit trail |
| `board_insights` | אנליטיקה — control room dashboards |
| `get_column_type_info` | סוגי עמודות — mapping validation |
| `search` | חיפוש בורדים/מסמכים |
| `get_updates` | עדכונים על פריט — comments/history |
| `list_users_and_teams` | משתמשים — auth/identity mapping |
| `get_user_context` | משתמש נוכחי |
| `fetch_custom_activity` | פעילות מותאמת |

### כתיבה (לאשר עם רותם לפני ביצוע)
| Tool | שימוש באפליקציה |
|------|------------------|
| `create_item` | יצירת פריט — writeback מהאפליקציה ל-Monday |
| `change_item_column_values` | עדכון ערכי עמודות — status sync |
| `move_item_to_group` | העברה בין קבוצות — workflow transitions |
| `create_update` / `create_update_in_monday` | הוספת עדכונים עם mentions |
| `create_notification` | שליחת התראות למשתמשים |
| `create_timeline_item` | פריטי טיימליין |
| `update_assets_on_item` | קבצים מצורפים |
| `delete_item` / `delete_column` | מחיקה — זהירות מרבית |

### Dynamic GraphQL API (מתקדם)
| Tool | שימוש |
|------|--------|
| `all_monday_api` | GraphQL queries/mutations ישירות — לפעולות שאין להן tool ייעודי |
| `get_graphql_schema` | חקירת API — read/write operations |
| `get_type_details` | פרטי טיפוסים — לבניית queries מדויקות |

> **כלל חובה:** תמיד קרא `get_board_info` לפני `change_item_column_values` — לוודא column IDs.
> **כלל חובה:** תמיד קרא `get_graphql_schema` + `get_type_details` לפני `all_monday_api`.
> **Mirror columns — קריאה בלבד.** עדכון דרך בורד המקור בלבד.

## Google OAuth Architecture

### Flow
1. User clicks "התחבר עם Google" → `GET /api/auth/google/start` → redirect to Google
2. Google returns authorization code → `GET /api/auth/google/callback`
3. Server exchanges code for tokens (access + refresh + id_token)
4. Server verifies identity, checks Monday-based authorization, creates session
5. Refresh token saved to Supabase `google_oauth_tokens` table (service_role only, RLS enabled)
6. Access token refreshed server-side automatically when needed

### Key Files
| File | Purpose |
|---|---|
| `server/auth/googleOAuth.ts` | OAuth2 utilities: auth URL, code exchange, token refresh, JWT decode |
| `server/auth/tokenStore.ts` | Supabase CRUD for refresh/access tokens with auto-refresh |
| `server/auth/routes.ts` | OAuth routes: `/start`, `/callback`, `/token`, `/logout` |
| `src/features/auth/LoginScreen.tsx` | Login button (redirect, no GIS/client-side OAuth) |
| `src/features/calendar/GoogleCalendarContext.tsx` | Fetches access token from backend, auto-refresh timer |

### Prompt Strategy
- First-time user (no stored refresh token): `prompt=consent` — full consent screen, Google returns refresh_token
- Returning user (has refresh token): `prompt=select_account` — fast re-login, no consent screen
- Explicit re-auth (`?prompt=consent`): forces full consent (used by CalendarConnectBanner)

### Scopes
`openid email profile https://www.googleapis.com/auth/calendar`

Extensible — add Drive scope here when needed.

### Technician Calendar Access
Technicians who don't have direct calendar access can view their relevant events via `GET /api/calendar/my-events`, which uses the Google Service Account (`GOOGLE_SERVICE_ACCOUNT_JSON`) to fetch events from the shared operations calendar and filter by technician.

## Blocker Policy
If blocked after 1-2 implementation iterations (schema mismatch, integration ambiguity, platform constraints), consult external references (official docs/vendor APIs) before continuing.
Record what was checked and what decision was taken.

## Definition of Done (Per Task)
- Code compiles and app builds.
- Access control behavior is explicit and tested manually.
- Failure modes are fail-closed and user-visible.
- Contract and mapping assumptions are documented in task/PR notes.
# Security rules for this project

- Supabase credentials are configured locally via environment variables only.
- Never print, echo, log, summarize, commit, or hardcode any secret values.
- Never add real credentials to `.env.example`, source files, markdown docs, commits, or chat responses.
- Use only the variable names below when needed:
  - `SUPABASE_URL`
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_SERVICE_ACCOUNT_JSON`
  - `OPENROUTER_API_KEY`
  - `MONDAY_API_TOKEN`
- If any required secret is missing, stop and report only the missing variable name.
- Do not modify `.env`, `.env.local`, `.env.production`, or secret-bearing config files unless explicitly instructed.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code under any circumstance.
- Do not expose `GOOGLE_CLIENT_SECRET` or `GOOGLE_SERVICE_ACCOUNT_JSON` to client-side code under any circumstance.
- OAuth refresh tokens must never be sent to the client; only short-lived access tokens via `/api/auth/google/token`.
- Any Supabase write operation must be server-side only.
- Prefer read-only access for MCP and diagnostics unless a task explicitly requires writes.
- Before any schema or data-changing operation, explain the intended change briefly and keep scope minimal.
- Redact secrets from logs, error messages, screenshots, and debug output.
- If a secret is suspected to be exposed, stop and instruct the user to rotate it before continuing.

## Operational model source of truth

- Read `docs/upflow_operational_model_v1_he.md` before any work related to:
  - operational data model
  - runtime sync
  - Monday board mappings
  - Team / Calendar / Operations / Facility views
  - exceptions
  - AI operational context
- Treat it as the V1 canonical spec for operational control.
- Prefer incremental alignment of the current codebase to this spec.
- Do not implement UI heuristics where canonical runtime projections are required.
- If the codebase conflicts with the document, report the conflict explicitly before proceeding.

## Control room UI source of truth

- Read `docs/operations_control_room_spec_he.md` before any work related to:
  - Operations Control Room layout and behavior
  - summary cards / management tabs / operations queue
  - operation drilldown modal and recommended next action
  - role-scoped control room behavior (operations manager vs technician)
- Treat this document as the canonical V1 UI intent for control-room workflows.
- Apply it incrementally on top of existing runtime projections and exceptions.
- If it conflicts with existing UI behavior, align via small slices and document the conflict first.
