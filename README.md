# Upflow Platform Codex

## Project Purpose
Upflow Platform is a React + TypeScript operations dashboard for internal operational visibility.

Current UI modules in the codebase:
- `AI Agent` – asks operational questions against platform data via OpenRouter-backed API endpoints.
- `Calendar` – connects to Google Calendar (read-only) and shows technician tasks in a weekly grid.
- `Clients` – searchable/sortable client overview.
- `Team` – technician and pending task overview.
- `Equipment` – facility dossiers (`תיקי מתקן`) with column-level details and file links.

The app pulls live data from Monday and falls back to generated local data files when needed.

## Local Setup
### Prerequisites
- Node.js 20+ (recommended for current Vite toolchain)
- npm

### Install
```bash
cd C:\Users\tomer\Documents\Playground\upflow-platform\app
npm install
```

### Configure environment
1. Copy `.env.example` to `.env.local`.
2. Fill required variables (see "Environment Variables").

### Run development server
```bash
npm run dev -- --host 127.0.0.1 --port 5175
```

### Build
```bash
npm run build
```

### Preview production build
```bash
npm run preview
```

## Scripts
Defined in `package.json`:

- `npm run dev`  
  Starts Vite dev server.

- `npm run build`  
  Type-checks and builds production assets (`tsc -b && vite build`).

- `npm run lint`  
  Runs ESLint.

- `npm run preview`  
  Serves built assets via Vite preview.

- `npm run sync:monday:pull`  
  Runs `scripts/pull-active-clients-from-monday.mjs` (read-only pull from Monday, regenerates local data files under `src/data`).

- `npm run sync:monday:clients`  
  Runs `scripts/sync-active-clients-to-monday.mjs`, which is currently intentionally disabled by policy.

## Environment Variables
### Required for core runtime
- `MONDAY_API_TOKEN`  
  Required by Monday pull script and `/api/runtime-db/sync/monday-snapshot`.

- `OPENROUTER_API_KEY`  
  Required by `/api/ai/chat`.

### Optional with defaults in code
- `MONDAY_ACTIVE_CLIENTS_BOARD_ID` (default: `1284652674`)
- `MONDAY_EQUIPMENT_BOARD_ID` (default: `2119399147`)
- `OPENROUTER_SIMPLE_MODEL` (default: `google/gemini-2.5-flash`)
- `OPENROUTER_COMPLEX_MODEL` (default: `openai/gpt-5.2`)

### Google Calendar (frontend)
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_TARGET_CALENDAR_NAME` (default: `לוז טכנאים`)
- `VITE_GOOGLE_TARGET_CALENDAR_ID` (default: `upflow.operations@gmail.com`)

### Notes
- `.env.example` currently includes Monday + Google variables, but does **not** list OpenRouter variables even though they are required by the AI endpoint.

## Architecture Overview
### Frontend
- React 19 + TypeScript + Vite.
- Entry point: `src/main.tsx`.
- Shell and view routing: `src/App.tsx`.
- Feature modules under `src/features/*`.
- Fallback datasets under `src/data/*`.

### API layer
There is no separate server folder. API endpoints are implemented as Vite middleware in `vite.config.ts`:
- `GET /api/runtime-db/snapshot`
- `POST /api/ai/memory`
- `POST /api/ai/chat`

### Runtime flow (current implementation)
1. App loads and calls `/api/runtime-db/snapshot`.
2. Snapshot polling continues every 5 minutes.
3. If snapshot fails, app continues using local fallback data.
4. AI page sends question + generated context to `/api/ai/chat`.
5. AI endpoint selects model (simple/complex heuristic), calls OpenRouter, and persists memory to `.upflow-ai-memory.json`.

## Monday Integration Notes
- Monday GraphQL API endpoint: `https://api.monday.com/v2`.
- Both clients and equipment boards are fetched server-side by Vite middleware.
- Board IDs are configurable via env vars.
- `scripts/pull-active-clients-from-monday.mjs` is a read-only sync utility that writes:
  - `src/data/clientsData.ts`
  - `src/data/facilitiesData.ts`
- App-level sync behavior:
  - initial fetch on load
  - scheduled polling every 5 minutes

## Current Limitations
- API is coupled to Vite middleware (`vite.config.ts`), not a standalone production backend service.
- README was previously generic; operational setup has implicit assumptions.
- `.env.example` is incomplete for AI runtime (missing `OPENROUTER_*` entries).
- Local fallback data files may contain text encoding artifacts (mojibake) in some Hebrew fields.
- AI context currently includes large board content, which can affect latency/cost/token usage.
- Memory persistence is local file-based (`.upflow-ai-memory.json`) with no multi-instance coordination.
- Google Calendar flow is browser OAuth read-only and depends on proper OAuth origin configuration.
