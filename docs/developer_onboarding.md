# Up-Flow Platform — Developer Onboarding

> Last updated: March 2026
> Maintained by: Rotem Potok (rotem@up-flow.co.il)

---

## What Is This Project?

**Up-Flow** (אפ-פלו) is a wastewater treatment operations company. This platform is an internal operations dashboard that connects to Monday.com boards and a Supabase database to give the operations team real-time visibility into:

- Field technician schedules
- Open service operations
- Exceptions and alerts
- Client and site data

The app is **not customer-facing** — it's an internal tool for the Up-Flow team.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | CSS-in-JS (inline styles), no design system yet |
| Backend / DB | Supabase (PostgreSQL) |
| Data source | Monday.com (via REST API) |
| Auth | Google OAuth2 (Authorization Code Flow) + Monday-based role/permissions |
| Hosting | TBD |
| Package manager | npm |

---

## Repo Structure

```
upflow-platform-codex/
├── src/
│   ├── features/
│   │   ├── home/          ← Main dashboard (HomeDashboard.tsx)
│   │   ├── auth/          ← Login / session (LoginScreen.tsx)
│   │   ├── calendar/      ← Google Calendar integration
│   │   └── ...
│   ├── lib/
│   │   ├── monday/        ← Monday.com API client + read.ts
│   │   ├── supabase/      ← DB client + schema types
│   │   └── sync/          ← Sync engine (Monday → Supabase)
│   ├── types/             ← Shared TypeScript types
│   └── App.tsx
├── server/
│   ├── auth/              ← Auth system (OAuth, session, Monday authz, token store)
│   ├── calendar/          ← Backend calendar access (Service Account)
│   └── runtime/           ← Supabase runtime client
├── supabase/
│   └── schema/            ← SQL migrations (run in order)
├── docs/                  ← Architecture docs (start here)
│   ├── developer_onboarding.md   ← You are here
│   ├── upflow_monday_boards_spec.md
│   ├── sync_plan.md
│   └── upflow_operational_model_v1_he.md
└── package.json
```

---

## Local Setup

```bash
# 1. Clone
git clone https://github.com/rotempotok-sys/upflow-platform-codex
cd upflow-platform-codex

# 2. Install dependencies
npm install

# 3. Set environment variables
cp .env.example .env.local
# Fill in required variables (see Environment Variables section below)

# 4. Run dev server
npm run dev
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth2 Client ID (public, used in frontend) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 Client Secret (server-side only) |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (e.g. `http://localhost:5173/api/auth/google/callback`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service Account JSON for backend calendar access |
| `MONDAY_API_TOKEN` | Monday.com API token for board reads |
| `MONDAY_ACTIVE_CLIENTS_BOARD_ID` | Board ID for active clients |
| `MONDAY_EQUIPMENT_BOARD_ID` | Board ID for equipment |
| `MONDAY_OPERATIONS_BOARD_ID` | Board ID for operations |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI features |

TypeScript check:
```bash
npx tsc --noEmit
```

---

## Data Architecture

The app uses a **two-layer data model**:

### Layer 1 — Monday.com (Source of Truth)
All operational data lives in Monday.com boards. The team manages everything there.

### Layer 2 — Supabase (Runtime Cache)
A sync engine pulls data from Monday → Supabase every few minutes. The frontend reads exclusively from Supabase for performance.

**Key types** (in `src/types/`):

| Type | Description |
|---|---|
| `RuntimeOperationSnapshot` | A single service operation |
| `RuntimeScheduleEntrySnapshot` | A technician's scheduled visit |
| `RuntimeExceptionSnapshot` | An alert or exception |
| `RuntimeOperationalProjections` | Aggregated views (by tech, by facility, daily) |

---

## Monday.com Boards

| Board | ID | Purpose |
|---|---|---|
| Operations Center | 1798247340 | All service operations |
| Employee Schedule | 1783389345 | Technician daily schedule |
| Employees | 1729562303 | Team members + roles |
| Field Reports | 1282241018 | Post-visit reports |
| Procurement | 1281580539 | Equipment & orders |

Deep-link pattern:
```
https://upflow-team.monday.com/boards/{boardId}/pulses/{itemId}
```

Full board schema → see `docs/upflow_monday_boards_spec.md`

---

## Authentication Architecture

The app uses **Google OAuth2 Authorization Code Flow** with server-managed tokens:

1. **Login**: User clicks "התחבר עם Google" → redirected to Google → returns with auth code → server exchanges for tokens
2. **Session**: Cookie-based session (`upflow_session`), in-memory session store
3. **Authorization**: Monday.com Employees board determines role (Admin/Operations/Technician/Viewer) and approval status
4. **Calendar**: Same OAuth flow grants calendar access — no separate connection needed
5. **Token refresh**: Refresh tokens stored in Supabase (`google_oauth_tokens`), auto-refreshed server-side
6. **Technician calendar**: Backend Service Account endpoint for technicians without direct calendar access

Key files: `server/auth/googleOAuth.ts`, `server/auth/tokenStore.ts`, `server/auth/routes.ts`

## Current State (March 2026)

**Done:**
- Supabase schema with all runtime tables (migrations 001–008)
- Monday.com sync engine (reads all 5 boards)
- HomeDashboard: KPIs, unassigned ops, today's schedule by technician
- Monday deep-links from dashboard items
- Unified Google OAuth (login + calendar in single flow)
- Server-side token management with auto-refresh
- Backend calendar endpoint for technicians (Service Account)

**In progress / next:**
- UI redesign (this is where you come in)
- Exception handling view
- Role-based views (admin vs technician)
- Write-back to Monday (open op, change status, send message)
- Google Drive integration (scope already extensible)

---

## Branch Strategy

```
main              ← stable, always deployable
feature/ui-*      ← UI work (Antigravity)
feature/sync-*    ← Backend/sync work (Cowork + Claude)
```

Always branch from `main`, PR back to `main`.

---

## Contact

Questions → Rotem: rotempotok@gmail.com
