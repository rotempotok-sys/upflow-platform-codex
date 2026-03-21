# תוכנית סנכרון — Monday → Supabase
_עודכן: 2026-03-10 (Phase 4 code complete — ממתין לאישור Schema + sync)_

---

## מה Codex עשה (עד כה)

### שינויים ב-schema

| קובץ | שינוי |
|---|---|
| `001_runtime_baseline.sql` | consolidated — כולל עכשיו `facilities_relation_ids`, `business_status`, `operation_group_status`, `technician_name` |
| `003_clients_facilities_relation_ids.sql` | `ALTER TABLE clients ADD COLUMN IF NOT EXISTS facilities_relation_ids text[]` |
| `004_operations_status_and_group_status.sql` | `ALTER TABLE operations ADD COLUMN IF NOT EXISTS business_status text, operation_group_status text` |
| `005_assignments_technician_name.sql` | `ALTER TABLE assignments ADD COLUMN IF NOT EXISTS technician_name text` (**חדש**) |

> **הערה:** 003 ו-004 כעת מיותרים מבחינת ה-baseline, אבל בטוחים ל-apply בגלל `IF NOT EXISTS`.

### שינויים ב-sync.ts

- `hasClientsFacilitiesRelationIdsColumn()` — backward-compat probe לעמודה
- `clientRows`: כולל `facilities_relation_ids` בצורה מותנית
- `operationRows`: כולל `business_status: entry.operationStatus ?? entry.businessStatus`, `operation_group_status`
- `assignmentRows`: כולל `technician_name`

### שינויים ב-mondayRuntimeNormalize.ts

- `RuntimeOperationSnapshotRow`: נוסף `operationGroupStatus`, `facilityLinkageState`, `technicianLinkageState`, `isOpen`
- `RuntimeOperationAssignmentSnapshotRow`: נוסף `technicianName`
- פונקציית `mapOperationGroupStatus()` — ממפה group IDs לתוויות עברית
- לוגיקת `isOpen` — derived מ-group + status

---

## ניתוח פערים — מה עוד חסר

### טבלת operations — פערים

| שדה | מצב בנרמלייזר | מצב ב-sync.ts | מצב ב-schema | סיכום |
|---|---|---|---|---|
| `business_status` | ✅ `businessStatus` | ✅ כתוב | ✅ `004` + `001` | **מוכן** |
| `operation_group_status` | ✅ `operationGroupStatus` | ✅ כתוב | ✅ `004` + `001` | **מוכן** |
| `execution_status` | ✅ `executionStatus` | ✅ כתוב | ✅ `001` | **מוכן** |
| `is_open` | ✅ `isOpen` | ✅ כתוב (`006`) | ✅ `006` | **מוכן — ממתין לApply** |
| `operation_category` | ✅ `operationCategory` | ✅ כתוב (`006`) | ✅ `006` | **מוכן — ממתין לApply** |
| `request_purpose_raw` | ✅ `requestPurposeRaw` | ✅ כתוב (`006`) | ✅ `006` | **מוכן — ממתין לApply** |
| `title` | ✅ `name` (item) | ✅ כתוב (`006`) | ✅ `006` | **מוכן — ממתין לApply** |

### טבלת users — פערים

| שדה | מצב בנרמלייזר | מצב ב-sync.ts | מצב ב-schema | סיכום |
|---|---|---|---|---|
| `employee_status` | ❌ לא מיוצר | ❌ לא נכתב | ❌ חסר | **צריך normalizer + schema + code** |
| `can_team` | ❌ לא מיוצר | ❌ לא נכתב | ❌ חסר | **צריך normalizer + schema + code** |
| `can_calendar` | ❌ לא מיוצר | ❌ לא נכתב | ❌ חסר | **צריך normalizer + schema + code** |
| `can_clients` | ❌ לא מיוצר | ❌ לא נכתב | ❌ חסר | **צריך normalizer + schema + code** |
| `can_equipment` | ❌ לא מיוצר | ❌ לא נכתב | ❌ חסר | **צריך normalizer + schema + code** |
| `can_assistant` | ❌ לא מיוצר | ❌ לא נכתב | ❌ חסר | **צריך normalizer + schema + code** |
| `can_ai_ask` | ❌ לא מיוצר | ❌ לא נכתב | ❌ חסר | **צריך normalizer + schema + code** |

### טבלת schedule_entries — פערים

| שדה | מצב בנרמלייזר | מצב ב-sync.ts | מצב ב-schema | סיכום |
|---|---|---|---|---|
| `task_type` | ✅ `taskType` | ✅ כתוב (`008`) | ✅ `008` | **מוכן — ממתין לApply** |
| `planned_date` | ✅ `plannedDate` | ✅ כתוב (`008`) | ✅ `008` | **מוכן — ממתין לApply** |
| `planned_datetime` | ✅ `plannedDateTime` | ✅ כתוב (`008`) | ✅ `008` | **מוכן — ממתין לApply** |

---

## Phase 0 — Apply Schema (בלוקר מיידי)

פעולה ידנית חד-פעמית ב-Supabase SQL Editor:

```
https://supabase.com/dashboard/project/ieaurqjieokbqnfwimii/sql
```

להריץ לפי הסדר:

1. `supabase/schema/001_runtime_baseline.sql` — כל הטבלאות הבסיסיות (כולל עדכוני Codex)
2. `supabase/schema/002_runtime_assignments_unique.sql` — unique index על assignments
3. `supabase/schema/003_clients_facilities_relation_ids.sql` — עמודת facilities_relation_ids (safe/idempotent)
4. `supabase/schema/004_operations_status_and_group_status.sql` — business_status + operation_group_status (safe/idempotent)
5. `supabase/schema/005_assignments_technician_name.sql` — technician_name (חדש מ-Codex)

**ולידציה:** לאחר הרצה, `GET /api/runtime-db/health` צריך להחזיר `200 ok: true`.

---

## Phase 1 — Schema + Code Completion (עמודות חסרות)

> ⚠️ שלב זה דורש גם שינוי קוד (normalizer + sync) וגם SQL. צריך לעשות אותם יחד.

### קובץ: `006_operations_canonical_fields.sql`

```sql
alter table if exists operations
  add column if not exists title text,
  add column if not exists request_purpose_raw text,
  add column if not exists operation_category text,
  add column if not exists is_open boolean not null default false,
  add column if not exists requires_schedule boolean not null default false,
  add column if not exists requires_report boolean not null default false,
  add column if not exists requires_qa boolean not null default false,
  add column if not exists closed_at timestamptz;

create index if not exists idx_operations_category on operations(operation_category);
create index if not exists idx_operations_is_open on operations(is_open);
create index if not exists idx_operations_client_id on operations(client_id);
```

**שינוי קוד נדרש ב-sync.ts:**
- הוסף ל-`operationRows`: `title`, `request_purpose_raw`, `operation_category`, `is_open`
- מקורות: `entry.metadata.name` / `entry.requestPurposeRaw` / `entry.operationCategory` / `entry.isOpen`

### קובץ: `007_users_permission_columns.sql`

```sql
alter table if exists users
  add column if not exists employee_status text,
  add column if not exists can_team boolean not null default false,
  add column if not exists can_calendar boolean not null default false,
  add column if not exists can_clients boolean not null default false,
  add column if not exists can_equipment boolean not null default false,
  add column if not exists can_assistant boolean not null default false,
  add column if not exists can_ai_ask boolean not null default false;
```

**שינוי קוד נדרש:**
- `mondayRuntimeNormalize.ts`: `normalizeUsersFromAuthBoard()` — קרא עמודות `boolean_mm1699jc`, `boolean_mm1680j8`, `boolean_mm16kwda`, `boolean_mm16e9yf`, `boolean_mm16vydm`, `boolean_mm16vdk4` מבורד `1729562303` והכנס ל-`RuntimeUserSnapshotRow`
- `sync.ts`: `userRows` — הוסף `can_team`, `can_calendar`, `can_clients`, `can_equipment`, `can_assistant`, `can_ai_ask`

### קובץ: `008_schedule_entries_canonical_fields.sql`

```sql
alter table if exists schedule_entries
  add column if not exists task_type text,
  add column if not exists planned_date date,
  add column if not exists planned_datetime timestamptz;

create index if not exists idx_schedule_planned_date on schedule_entries(planned_date);
create index if not exists idx_schedule_task_type on schedule_entries(task_type);
```

**שינוי קוד נדרש ב-sync.ts:**
- הוסף ל-`scheduleEntryRows`: `task_type: entry.taskType`, `planned_date: entry.plannedDate`, `planned_datetime: entry.plannedDateTime`
- הנרמלייזר כבר מייצר שדות אלה — רק sync.ts צריך לכתוב אותם כ-top-level

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

## Phase 3 — Normalization Gaps (ולידציה לאחר sync ראשון)

לאחר sync ראשון, לבדוק שהנורמליזציה ממלאת נכון:

| שדה ב-Supabase | מקור ב-Monday | Board ID |
|---|---|---|
| `operations.title` | `name` של האייטם | `1798247340` |
| `operations.request_purpose_raw` | `dropdown_mkmm9qzh` | `1798247340` |
| `operations.operation_category` | derived מ-`request_purpose_raw` | — |
| `operations.is_open` | group ∈ {topics, group_title} | `1798247340` |
| `operations.business_status` | `operationStatus ?? businessStatus` | `1798247340` |
| `operations.operation_group_status` | derived מ-group ID | `1798247340` |
| `users.can_team` | `boolean_mm1699jc` | `1729562303` |
| `users.can_calendar` | `boolean_mm1680j8` | `1729562303` |
| `users.can_clients` | `boolean_mm16kwda` | `1729562303` |
| `users.can_equipment` | `boolean_mm16e9yf` | `1729562303` |
| `users.can_assistant` | `boolean_mm16vydm` | `1729562303` |
| `users.can_ai_ask` | `boolean_mm16vdk4` | `1729562303` |
| `schedule_entries.technician_email` | `lookup_mm17dqgp` (canonical) | `1783389345` |
| `schedule_entries.planned_date` | `date4` | `1783389345` |
| `schedule_entries.task_type` | metadata → `taskType` | `1783389345` |
| `reports.operation_id_ref` | `text_mkmemh8m` | `1282241018` |
| `reports.technician_email` | `lookup_mm171ygf` | `1282241018` |
| `reports.qa_status` | `status6` | `1282241018` |

**כלל V1:** `technician_email` מגיע מ-`lookup_mm17dqgp` — אם ריק, fallback ל-`dropdown_mkmmb2x` (legacy).

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

> הערה: `OVERDUE_EXECUTION` דורש שהעמודה `planned_date` תהיה top-level ב-`schedule_entries` (Phase 1 → 008).

---

## Phase 5 — Projections (API endpoints)

לבנות 4 endpoints שה-frontend יצרוך:

### `/api/runtime-db/projections/technician-view`
```sql
SELECT u.email, u.display_name,
  count(se) filter (where se.schedule_control_status != 'Executed') as open_tasks,
  count(se) filter (where se.planned_date < now()) as overdue_tasks,
  count(r) filter (where r.flow_status = 'Waiting for Report') as missing_reports
FROM users u
LEFT JOIN schedule_entries se ON se.technician_email = u.email
LEFT JOIN reports r ON r.technician_email = u.email
GROUP BY u.email, u.display_name
```
> דורש Phase 1 → 008 (planned_date כעמודה).

### `/api/runtime-db/projections/facility-view`
```sql
SELECT f.*, count(o) as open_operations, count(e) as exceptions
FROM facilities f
LEFT JOIN operations o ON o.facility_id = f.id AND o.is_open = true
LEFT JOIN exceptions e ON e.operation_id = o.id
GROUP BY f.id
```
> דורש Phase 1 → 006 (is_open כעמודה).

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

## סיכום — סדר עדיפויות (מעודכן)

| שלב | פעולה | מי | סטטוס |
|---|---|---|---|
| **0** | Apply SQL 001–005 ב-Supabase | **ידני (Rotem)** | ⏳ ממתין לאישור |
| **1a** | צור SQL 006–008 | Claude/Codex | ✅ הושלם |
| **1b** | עדכן `mondayRuntimeNormalize.ts` — users permissions | Codex | ✅ הושלם |
| **1c** | עדכן `sync.ts` — top-level columns + exceptions | Codex | ✅ הושלם |
| **1d** | עדכן `read.ts` — קרא עמודות קנוניות + permission columns | Codex | ✅ הושלם (2026-03-10) |
| **1e** | תקן Hebrew encoding ב-`exceptions.ts` + `read.ts` | Codex | ✅ הושלם |
| **2a** | Apply SQL 006–008 ב-Supabase | **ידני (Rotem)** | ⏳ ממתין |
| **2b** | הגדר credentials ב-.env.local | **ידני (Rotem)** | ⏳ ממתין |
| **2c** | Health check + sync ראשון | Claude + Rotem | ⏳ ממתין |
| **3** | ולידציה של normalization | Claude | ⏳ ממתין |
| **4** | ולידציה של exception engine | Claude | ⏳ ממתין |
| **5** | בניית projection endpoints | Codex | ⏳ ממתין |
| **6** | GitHub Integration | Claude + Rotem | ⏳ ממתין |
