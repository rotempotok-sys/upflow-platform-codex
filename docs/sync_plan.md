# תוכנית סנכרון — Monday → Supabase
_נכתב: 2026-03-09_

## מצב נוכחי

הקוד **מוכן ברובו** — schema כתוב, sync engine כתוב, normalization כתובה.
הפער הוא בין הקוד לבין Supabase בפועל: ה-schema לא הוחל, credentials לא מוגדרים, ו-3 עמודות חסרות.

---

## Phase 0 — Apply Schema (בלוקר מיידי)

פעולה ידנית חד-פעמית ב-Supabase SQL Editor:

```
https://supabase.com/dashboard/project/ieaurqjieokbqnfwimii/sql
```

להריץ לפי הסדר:

1. `supabase/schema/001_runtime_baseline.sql` — כל הטבלאות הבסיסיות
2. `supabase/schema/002_runtime_assignments_unique.sql` — unique index על assignments
3. `supabase/schema/003_clients_facilities_relation_ids.sql` — עמודת facilities_relation_ids
4. `supabase/schema/004_operations_status_and_group_status.sql` — business_status + operation_group_status

**ולידציה:** לאחר הרצה, `GET /api/runtime-db/health` צריך להחזיר `200 ok: true`.

---

## Phase 1 — Schema Completion (עמודות חסרות)

### בעיה
הקוד ב-`sync.ts` ו-`mondayRuntimeNormalize.ts` מייצר שדות שעדיין לא קיימים בטבלאות.

### קובץ חדש: `005_operations_canonical_fields.sql`

```sql
-- Operations: שדות קנוניים מהמודל התפעולי
alter table if exists operations
  add column if not exists title text,
  add column if not exists request_purpose_raw text,
  add column if not exists operation_category text,
  add column if not exists request_status_raw text,
  add column if not exists is_open boolean not null default false,
  add column if not exists requires_schedule boolean not null default false,
  add column if not exists requires_report boolean not null default false,
  add column if not exists requires_qa boolean not null default false,
  add column if not exists closed_at timestamptz;

create index if not exists idx_operations_category on operations(operation_category);
create index if not exists idx_operations_is_open on operations(is_open);
create index if not exists idx_operations_client_id on operations(client_id);
```

### קובץ חדש: `006_users_permission_columns.sql`

```sql
-- Users: עמודות הרשאות מסכים מבורד קשר עובדים (1729562303)
alter table if exists users
  add column if not exists employee_status text,
  add column if not exists can_team boolean not null default false,
  add column if not exists can_calendar boolean not null default false,
  add column if not exists can_clients boolean not null default false,
  add column if not exists can_equipment boolean not null default false,
  add column if not exists can_assistant boolean not null default false,
  add column if not exists can_ai_ask boolean not null default false;
```

### קובץ חדש: `007_schedule_entries_canonical_fields.sql`

```sql
-- Schedule entries: שדות קנוניים מלוז עובדים (1783389345)
alter table if exists schedule_entries
  add column if not exists task_type text,
  add column if not exists planned_date date,
  add column if not exists planned_datetime timestamptz;
```

---

## Phase 2 — Credentials & First Sync

### צעד 1: הגדרת credentials ב-.env.local

יש להוסיף לקובץ `.env.local` (לא להחזיר ל-git):

```
SUPABASE_URL=https://ieaurqjieokbqnfwimii.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<מה-Dashboard: Project Settings → API → service_role>
SUPABASE_ANON_KEY=<מה-Dashboard: Project Settings → API → anon/public>
SUPABASE_DB_SCHEMA=public
```

### צעד 2: בדיקת health

```bash
# בטרמינל עם server פעיל
curl http://localhost:5176/api/runtime-db/health
# ציפייה: {"ok":true,"health":{"ready":true,...}}
```

### צעד 3: הרצת sync ראשון (Admin בלבד)

```bash
curl -X POST http://localhost:5176/api/runtime-db/sync/monday-snapshot \
  -H "Cookie: <session cookie>"
# ציפייה: {"ok":true,"sync":{"syncRunId":...,"rowsUpserted":...}}
```

### צעד 4: smoke check

```bash
curl http://localhost:5176/api/runtime-db/smoke
# ציפייה: clients > 0, facilities > 0
```

---

## Phase 3 — Normalization Gaps (לאחר sync ראשון)

לאחר sync ראשון, יש לבדוק אם הנורמליזציה ממלאת נכון את השדות:

| שדה ב-Supabase | מקור ב-Monday | Board ID |
|---|---|---|
| `operations.title` | `name` של האייטם | `1798247340` |
| `operations.request_purpose_raw` | `dropdown_mkmm9qzh` | `1798247340` |
| `operations.operation_category` | derived מ-`request_purpose_raw` | — |
| `operations.request_status_raw` | `color_mkngxc3y` | `1798247340` |
| `operations.is_open` | group ∈ {topics, group_title} | `1798247340` |
| `operations.assigned_technician_email` | `lookup_mm174zqb` | `1798247340` |
| `users.can_team` | `boolean_mm1699jc` | `1729562303` |
| `users.can_calendar` | `boolean_mm1680j8` | `1729562303` |
| `users.can_clients` | `boolean_mm16kwda` | `1729562303` |
| `users.can_equipment` | `boolean_mm16e9yf` | `1729562303` |
| `users.can_assistant` | `boolean_mm16vydm` | `1729562303` |
| `users.can_ai_ask` | `boolean_mm16vdk4` | `1729562303` |
| `schedule_entries.technician_email` | `lookup_mm17dqgp` (canonical) | `1783389345` |
| `schedule_entries.planned_date` | `date4` | `1783389345` |
| `reports.operation_id_ref` | `text_mkmemh8m` | `1282241018` |
| `reports.technician_email` | `lookup_mm171ygf` | `1282241018` |
| `reports.qa_status` | `status6` | `1282241018` |

**כלל V1:** technician_email מגיע מ-`lookup_mm17dqgp` — אם ריק, fallback ל-`dropdown_mkmmb2x` (legacy).

---

## Phase 4 — Exception Engine (ולידציה)

לאחר sync ראשון, לוודא שהחריגות הקנוניות מחושבות ונשמרות ב-`exceptions`:

| קוד חריגה | תנאי |
|---|---|
| `MISSING_TECHNICIAN` | אופרציה פתוחה ללא `technician_email` |
| `MISSING_SCHEDULE` | אופרציה פתוחה ללא שורת לוז |
| `MISSING_CALENDAR_LINK` | שורת לוז ללא `calendar_event_id` |
| `MISSING_REPORT` | אופרציה ב-"Waiting for Report" ללא report |
| `OVERDUE_EXECUTION` | `planned_date` < היום והמשימה לא הושלמה |
| `AMBIGUOUS_FACILITY_MAPPING` | לקוח עם >1 מתקנים ללא שיוך מפורש |
| `ORPHAN_SCHEDULE_ENTRY` | שורת לוז ללא `operation_id` |
| `ORPHAN_REPORT` | דיווח ללא `operation_id` |
| `REPEAT_FIELD_VISIT` | >1 ביקורים לשטח לאותה אופרציה |

---

## Phase 5 — Projections (API endpoints)

לבנות 4 endpoints שה-frontend יצרוך:

### `/api/runtime-db/projections/technician-view`
```
SELECT u.email, u.display_name,
  count(se) filter (where se.schedule_control_status != 'Executed') as open_tasks,
  count(se) filter (where se.planned_date < now()) as overdue_tasks,
  count(r) filter (where r.flow_status = 'Waiting for Report') as missing_reports
FROM users u
LEFT JOIN schedule_entries se ON se.technician_email = u.email
LEFT JOIN reports r ON r.technician_email = u.email
GROUP BY u.email, u.display_name
```

### `/api/runtime-db/projections/facility-view`
```
SELECT f.*, count(o) as open_operations, count(e) as exceptions
FROM facilities f
LEFT JOIN operations o ON o.facility_id = f.id AND o.is_open = true
LEFT JOIN exceptions e ON e.operation_id = o.id
GROUP BY f.id
```

### `/api/runtime-db/projections/operation-view`
תצוגת אופרציה עם join מלא: client, facility, technician, schedule, report, exceptions.

### `/api/runtime-db/projections/daily-summary`
תצוגת שליטה יומית: מה קורה היום, מה דחוף, מה באיחור.

---

## Phase 6 — GitHub Integration (CI/CD)

לאחר שה-schema יציב:

1. Supabase Dashboard → Project Settings → Integrations → GitHub
2. חבר את `upflow-platform-codex`
3. הוסף GitHub Action:

```yaml
# .github/workflows/supabase-migrations.yml
name: Supabase Migrations
on:
  push:
    branches: [main]
    paths: ['supabase/schema/**']
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase db push --project-ref ieaurqjieokbqnfwimii
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
```

---

## סיכום — סדר עדיפויות

| שלב | פעולה | מי | זמן |
|---|---|---|---|
| **0** | Apply SQL 001–004 ב-Supabase | **ידני (Rotem)** | 10 דק' |
| **1** | צור SQL 005–007 + Apply | Claude | 30 דק' |
| **2** | הגדר credentials ב-.env.local | **ידני (Rotem)** | 5 דק' |
| **2** | Health check + sync ראשון | Claude + Rotem | 20 דק' |
| **3** | ולידציה של normalization | Claude | 30 דק' |
| **4** | ולידציה של exception engine | Claude | 20 דק' |
| **5** | בניית projection endpoints | Claude/Codex | 2-3 שעות |
| **6** | GitHub Integration | Claude + Rotem | 20 דק' |
