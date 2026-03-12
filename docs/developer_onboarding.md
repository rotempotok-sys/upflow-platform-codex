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
| Auth | Supabase Auth (email/password) |
| Hosting | TBD |
| Package manager | npm |

---

## Repo Structure

```
upflow-platform-codex/
├── src/
│   ├── features/
│   │   ├── home/          ← Main dashboard (HomeDashboard.tsx)
│   │   ├── auth/          ← Login / session
│   │   └── ...
│   ├── lib/
│   │   ├── monday/        ← Monday.com API client + read.ts
│   │   ├── supabase/      ← DB client + schema types
│   │   └── sync/          ← Sync engine (Monday → Supabase)
│   ├── types/             ← Shared TypeScript types
│   └── App.tsx
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
# Fill in: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_MONDAY_API_TOKEN

# 4. Run dev server
npm run dev
```

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

## Current State (March 2026)

**Done:**
- Supabase schema with all runtime tables (migrations 001–008)
- Monday.com sync engine (reads all 5 boards)
- HomeDashboard: KPIs, unassigned ops, today's schedule by technician
- Monday deep-links from dashboard items

**In progress / next:**
- UI redesign (this is where you come in)
- Exception handling view
- Role-based views (admin vs technician)
- Write-back to Monday (open op, change status, send message)

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
