# מסמך מסגרת למערכת מידע תפעולית וניהולית ל־Upflow

*ארכיטקטורת מידע, תפקידי פלטפורמות, מודל יישויות, מסגרת לסוכני AI ותוכנית עבודה בשלבים*

## החלטות יסוד

- Monday נשאר מקור האמת התפעולי של העסק: לקוחות, מתקנים, פעולות, שיוכים, סטטוסים והרשאות תפעוליות.
- Google Sheets נשאר שכבת תפעול נוחה: inbox, staging, review ידני, reconciliation, סיכומי AI ו־control tables.
- Postgres הופך למסד הנתונים של האפליקציה: snapshot מנורמל, projections, exceptions, audit ו־history.
- n8n הוא שכבת האינטגרציה והתזמור: webhooks, scheduled sync, enrichment, dual-write וטריגרים מבוקרים.
- האפליקציה והסוכנים אינם עובדים ישירות מול raw data; הם צורכים רק מודל מנורמל + שכבת policy והרשאות.

## מטרת המסמך

להגדיר מסגרת מעשית להקמת מערכת מידע שתשמש גם ככלי עזר לניהול השוטף וגם כתשתית לסוכני AI בעלי יכולת ניתוח, המלצה, קבלת החלטות מבוקרת וביצוע אוטומטי חלקי. המסמך מתמקד במבנה המידע, בקשרים בין הפלטפורמות, ביישויות המרכזיות, בשכבות הסנכרון ובתוכנית עבודה בשלבים.

## עקרונות מנחים

- מקורות העבודה של הצוות נשמרים במערכות המוכרות; האפליקציה אינה מחליפה אותן בבת אחת אלא מאחדת, מסננת ומבקרת אותן.
- כל visibility למשתמשים נאכף בצד השרת. אין להסתמך על סינון ב־UI בלבד.
- matching בין ישויות יתבצע לפי keys, relations, linked items ומיילים mirrored – לא לפי טקסט חופשי.
- יש להפריד בין raw events, normalized snapshot ו־user/client/facility projections.
- סוכני AI מקבלים context pack מובנה + policy layer + allowed actions; לא גישה חופשית לכל המקורות.

## הארכיטקטורה המומלצת

המבנה המומלץ הוא חמש שכבות ברורות, כך שכל שכבה ממלאת תפקיד מוגדר ואינה עמוסה בתפקידים של שכבה אחרת:

| שכבה | תפקיד עיקרי | פלטפורמות / רכיבים |
|---|---|---|
| מקורות תפעוליים | מקום העבודה השוטפת של הצוות והמערכות החיצוניות | Monday, WhatsApp/Whapi, Google Calendar, Gmail, Google Sheets |
| אינטגרציה ותזמור | קבלת webhooks, הרצת flows, enrichment, dual-write ו־scheduling | n8n |
| שכבת נתונים אפליקטיבית | אחסון snapshot מנורמל, history, audit, projections ו־exceptions | Postgres |
| שכבת אפליקציה ובקרה | API, auth/authz, מסכי שליטה, דוחות, חריגות ופעולות מבוקרות | upflow-platform |
| שכבת AI | ניתוח, תעדוף, המלצות, dispatch וביצוע מוגבל | AI services / agent runtime |

המשמעות הפרקטית: Monday ו־Sheets נשארים חשובים, אבל הם אינם מסד הנתונים שממנו האפליקציה והסוכנים אמורים להסיק מצב. Postgres הוא ה־runtime store של המערכת.

## תפקיד כל פלטפורמה

| פלטפורמה | מה שומרים בה | למה היא טובה | מה לא נכון לשים בה |
|---|---|---|---|
| Monday | יישויות עסקיות ותפעוליות חיות, status, assignments, linked items, mirrored fields | מקור אמת תפעולי, עבודה יומיומית, ownership ברור | joins אפליקטיביים מורכבים בזמן אמת ו־visibility logic למסכים |
| Google Sheets | inbox, staging, review ידני, reconciliation, תיעוד וסיכומי AI | מהיר לעריכה, קל לבקרה, נוח ל־n8n ולמשתמש אנושי | auth source, relational model, runtime visibility או state קריטי למסכים |
| n8n | flows, webhook handling, enrichment, routing, dual-write | חיבור מהיר בין מערכות, אוטומציה ו־orchestration | מקור אמת או history מלאה בפני עצמו |
| Postgres | normalized entities, event log, snapshot tables, projections, exceptions, audit | אמינות, joins, queryability, versioning והרשאות API | עריכה ידנית ויומיומית של המשתמשים |
| upflow-platform | workflow screens, אישורים, חריגות ותצוגות לפי scope | ממשק ניהולי, בקרה והחלטות | לוגיקת sync גולמית או אחסון raw בלתי מוגבל |
| AI agents | המלצות, סיכומים, חריגות, ניסוח משימות ופעולות מבוקרות | סקייל ניהולי, זיהוי דפוסים, תמיכה בהחלטות | גישה ישירה לא מבוקרת לכל מקור מידע |

## קישורים מומלצים בין הפלטפורמות

| זרימה | כיוון מומלץ | תכלית |
|---|---|---|
| אירועי WhatsApp | WhatsApp/Whapi → n8n → Google Sheets + Postgres | שימור inbox תפעולי נוח לצד event log אחיד |
| Webhooks ממאנדי | Monday → n8n → Postgres + Sheets log | audit, triggers ויכולת debug ידנית |
| סנכרון snapshot | Monday boards → n8n/Backend sync → Postgres | בניית normalized snapshot לישויות הליבה |
| יומן | Google Calendar → sync service → Postgres | קישור אירועים לפעולות/טכנאים באמצעות identifiers ו־mirrored emails |
| מסכי אפליקציה | App API → Postgres projections | טעינת מסכים מהירה, עקבית ומסוננת לפי הרשאות |
| סוכני AI | Agent runtime ← context pack מ־Postgres + policy layer | ניתוח וקבלת החלטות על בסיס תמונה מלאה אך מסודרת |
| ביצוע פעולות | Agent/App → guarded action endpoints / n8n | ביצוע מבוקר, logging, approvals ו־rollbackability |

## היישויות המרכזיות במערכת

המודל צריך להיות מבוסס יישויות מפורשות, עם מפתחות יציבים וקשרים ברורים. מומלץ להימנע ממצב שבו מסכים או סוכנים תלויים בטקסט חופשי כדי להבין קשרים.

| יישות | מפתח יציב מומלץ | מקור אמת עיקרי | קשרים מרכזיים |
|---|---|---|---|
| User | user_id / email | Auth + Monday mirrored identity | קשור ל־role, team, assignments, calendar entries ודוחות |
| Role / Permission Scope | role_key / scope_id | Auth config + policy tables | קובע visibility ו־allowed actions |
| Client | client_id | Monday | מכיל מתקנים, אנשי קשר, פעולות ודוחות |
| Facility | facility_id | Monday | שייך ללקוח; קשור לציוד, לפעולות, ללוח זמנים ולחריגות |
| Equipment / System | equipment_id | Monday / inventory data | שייך למתקן; קשור לתחזוקה, ביקורים ודוחות |
| Operation / Service Case | operation_id | Monday | קשור למתקן, ללקוח, לטכנאי, ללוח זמנים, לדוחות ולסטטוסים |
| Assignment | assignment_id | Monday / normalized relation | מחבר משתמשים לפעולות, תפקידים ותאריכים |
| Schedule Entry | schedule_entry_id | Monday / Calendar sync | מתאר תכנון עבודה, owner וקישור לפעולה |
| Calendar Event | calendar_event_id | Google Calendar | מקושר ל־schedule/operation/users לפי email/ids |
| Field Report | report_id | Monday / forms / uploads | סוגר או מעדכן פעולה; קשור למתקן, טכנאי ותאריך |
| Exception | exception_id | Derived in Postgres | מייצג gap, mismatch, missing link או SLA breach |
| Message / Communication | message_id | WhatsApp/Gmail ingest | נקשר ללקוח/מתקן/פעולה לפי entity linking |
| Sync Run | sync_run_id | Postgres | שומר metadata, warnings, errors ו־processing results |
| Agent Action | agent_action_id | Postgres | שומר המלצות, החלטות, approvals וביצוע בפועל |

## הקשרים החשובים בין היישויות

- Client 1:N Facility – לכל לקוח יכולים להיות כמה מתקנים.
- Facility 1:N Operation – כל מתקן מייצר פעולות שירות, תחזוקה, ביקורים או חריגות.
- Operation 1:N Assignment – פעולה יכולה להיות משויכת למספר אנשי צוות במועדים שונים.
- Operation 1:N Schedule Entry ו־Schedule Entry 0..1:1 Calendar Event – יש להבדיל בין תכנון לבין אירוע יומן בפועל.
- Operation 1:N Field Report – פעולה יכולה לקבל כמה דוחות לאורך חייה, אך לפחות דוח מסכם אחד בסגירה.
- User N:M Operation דרך Assignment – משתמש יכול להיות owner, reviewer, approver או observer.
- Facility 1:N Exception – חריגות נוצרות מתוך כללי בקרה על מצב המתקן והפעולות.
- Message N:1 / N:M ל־Client, Facility, Operation – לאחר entity linking, תקשורת הופכת לחלק מהקונטקסט התפעולי.

## שכבות הנתונים שיש ליישם

| שכבה | מה היא מכילה | מי צורך אותה |
|---|---|---|
| Raw Event Log | webhooks, הודעות, snapshots גולמיים, תשובות API ו־payloads לוגיים | debugging, replay, audit |
| Normalized Core Model | יישויות וקשרים מנורמלים עם keys יציבים | backend, reports, agents |
| Projections | views לפי משתמש / לקוח / מתקן / מסך | האפליקציה והסוכנים |
| Derived Intelligence | exceptions, KPIs, workload, priority scores ו־stale states | dashboards, מנהלים ו־AI agents |

## מודל הסנכרון המומלץ

מומלץ לבנות סנכרון בשתי לוגיקות משלימות: ingest גלובלי למודל מנורמל, ולאחריו projections ייעודיים לפי צרכן. זה עדיף על מסכים או סוכנים שבונים joins לעצמם.

### 1. סנכרון גלובלי (Global Sync)

- מושך נתונים מה־boards הרלוונטיים, מ־Calendar, ומאירועי תקשורת.
- מבצע normalization, entity linking, validation ו־fail-closed כאשר חסר mapping קריטי.
- שומר snapshot/version + warnings/errors בכל ריצת sync.

### 2. סנכרון פר משתמש (Per User Projection)

- מפיק view מסונן לפי role, scope, assignments ו־mirrored emails.
- מגדיר אילו לקוחות, מתקנים, פעולות, אירועי יומן, דוחות וחריגות המשתמש רשאי לראות.
- משמש בסיס למסכי Team, Calendar, Tasks, Exceptions ולסוכן אישי/ניהולי.

### 3. סנכרון פר לקוח (Per Client Projection)

- מאגד תמונת מצב מלאה של הלקוח: מתקנים, פעולות פתוחות, ביקורים עתידיים, דוחות אחרונים, חריגות וסיכון שירות.
- מאפשר מסך לקוח אחיד, בלי תלות בכמה קריאות וג׳וינים ב־UI.

### 4. סנכרון פר מתקן (Per Facility Projection)

- מאגד את כל מה שנוגע למתקן אחד: ציוד, תקלות, פעולות, ביקורים, דוחות, חריגות, KPI תפעוליים וצוות קשור.
- זוהי היחידה החשובה ביותר לשליטה תפעולית יומיומית.

### 5. מנוע חריגות (Exceptions Engine)

- מזהה missing links, report missing after visit, assignment mismatch, calendar mismatch, stale status ו־SLA breaches.
- מייצר queue פעולה ברור לבני אדם ולסוכני AI.

## המדדים והבקרות שיש להפיק

- backlog פתוח לפי טכנאי, לקוח ומתקן
- aging של פעולות ומשימות
- planned מול actual בביקורים
- דוחות חסרים אחרי ביקור
- מתקנים עם חריגות חוזרות ולקוחות בסיכון שירות
- פעולות ללא owner, ללא due date או ללא קישור למתקן
- ריצות sync שנכשלו, warnings פתוחים ו־schema drift

## מסגרת יישום לסוכני AI

כדי שסוכן יתפקד כמנהל מבצעי ולא כמסכם טקסטים, יש להזין אותו במבנה מידע אחיד ובסט פעולות מותרות. מומלץ להפריד בין ארבע רמות של סוכנים או מצבי פעולה:

| סוג סוכן / מצב | תפקיד | קלט עיקרי | פלט עיקרי |
|---|---|---|---|
| Observer | זיהוי מצב, תמונת מצב וחריגות | snapshot summary, KPIs, exceptions | תובנות, סיכונים, alerts |
| Analyst | ניתוח שורש הבעיה | event history, reports, communications | הסבר, causal hypotheses, missing data requests |
| Dispatcher | המלצה על סדר פעולות | open operations, workload, policy | תעדוף, השמות, ניסוח משימות, escalations |
| Executor | ביצוע פעולה מותרת | allowed actions + explicit context | יצירת משימה, עדכון סטטוס, שליחת בקשה, קריאת API מבוקרת |

### Context pack מומלץ לסוכן ניהולי

- `snapshot_summary` – מצב כללי של עומסים, חריגות, לקוחות בסיכון ופעולות עומדות.
- `open_operations` – רשימת פעולות פתוחות עם owner, priority, aging ו־missing links.
- `upcoming_schedule` – הביקורים הקרובים וההתאמה שלהם לפעולות ולמשתמשים.
- `recent_reports` – דוחות אחרונים, דוחות חסרים ודוחות עם סתירות.
- `team_workload` – עומס, פערי שיבוץ וזמינות יחסית.
- `communication_digest` – תמצית הודעות WhatsApp/מיילים שכבר קושרו לישויות עסקיות.
- `policy_constraints` – SLA, roles, approval rules ו־forbidden actions.
- `allowed_actions` – בדיוק אילו פעולות הסוכן רשאי להציע או לבצע.

### Guardrails מחייבים לסוכני AI

- הפרדה בין המלצה, אישור וביצוע.
- audit מלא לכל החלטה, prompt, source set ופעולה שבוצעה.
- confidence thresholds; כאשר confidence נמוך – הסוכן מסמן review במקום לבצע.
- גישה מבוססת scope בלבד; אין לסוכן גישה גלובלית כברירת מחדל.
- סוכן מקבל מודל מנורמל, לא raw table dumps או message streams בלתי מסודרים.

## תוכנית עבודה להקמת המערכת

התוכנית בנויה בשלבים, כך שכל שלב מוסיף יכולת אמיתית ואינו דורש redesign כולל. המטרה היא התקדמות מודולרית, זהירה ובת־בדיקה.

| שלב | מטרה | תוצרים עיקריים | הערות |
|---|---|---|---|
| 0. קיבוע החלטות ארכיטקטורה | ליישר קו על תפקידי הפלטפורמות והשכבות | ADR / spec קצר, קיבוע source-of-truth ו־DB role | לפני קוד משמעותי |
| 1. מודל נתונים וקונטרקט סנכרון | להגדיר entities, keys, relations ו־field mapping | טיפוסים, DTOs, mapping docs, validation rules | בסיס לכל המערכת |
| 2. שכבת Postgres בסיסית | להקים app database אמיתי | טבלאות core + raw_events + sync_runs + agent_actions | לא להעמיס business logic בשלב זה |
| 3. Dual-write דרך n8n | לשמור נוחות תפעולית תוך בניית בסיס אמין | כתיבה מקבילה ל־Sheets ול־Postgres מ־WhatsApp, Monday ו־AI summaries | מאפשר מעבר הדרגתי |
| 4. Global snapshot pipeline | לבנות snapshot מנורמל ראשון | ingest, normalization, entity linking, warnings/errors | מתחילים מה־boards הקריטיים ביותר |
| 5. Per-user projection | להפעיל visibility אמיתי פר משתמש | `me_snapshot`, calendar/team views, role filters | סינון בשרת בלבד |
| 6. Per-client + per-facility projections | לבנות שליטה אחידה פר ישות עסקית | client snapshot, facility snapshot, control views | בסיס למסכים המרכזיים |
| 7. Exceptions engine | להפוך gaps לרשימת עבודה | exception rules, queue, severity, ownership | קריטי לבקרה |
| 8. Migration למסכי ליבה | להעביר UI לצרוך snapshot/projections | Team, Calendar, Operations, Reports | בלי parsing של titles |
| 9. Context packs לסוכני AI | להזין agents במידע מובנה | manager context pack, personal agent pack, policy layer | רק אחרי שיש מודל אמין |
| 10. Guarded actions + approvals | לאפשר אוטונומיה חלקית מבוקרת | action endpoints, approvals, audit, rollbackability | אוטונומיה הדרגתית |

## סדר יישום מומלץ בטווח הקרוב

- לקבע בכתב את שכבות המידע והפלטפורמות: Monday = source of truth, Sheets = staging/control, Postgres = app DB.
- להקים טבלאות בסיס ב־Postgres: users, clients, facilities, operations, assignments, schedule_entries, reports, exceptions, sync_runs, raw_events, agent_actions.
- להפעיל dual-write דרך n8n למקורות המרכזיים: WhatsApp ingest, Monday webhooks וסיכומי AI.
- לבנות global snapshot pipeline ראשון עבור ה־boards הקריטיים ביותר.
- להוציא projection פר משתמש ראשון עבור Team + Calendar.
- רק לאחר מכן לבנות Operations Control, Reports, Exceptions ו־AI context packs.

## הגדרת הצלחה

- ניתן לענות לכל נתון על שלוש שאלות: מאיפה הגיע, למי הוא גלוי, ומתי סונכרן לאחרונה.
- מסכי הליבה אינם תלויים ב־parsing של titles או ב־manual joins ב־UI.
- סוכן AI פועל על בסיס context pack מובנה + policy layer + audit trail.
- אפשר להרחיב את המערכת בלי להמציא מחדש את מודל המידע בכל מסך או flow.

## המלצה מסכמת

המהלך הנכון אינו להחליף בבת אחת את Monday או את Google Sheets, אלא להוסיף שכבת מידע אפליקטיבית יציבה שמאחדת אותם. כך נשמרת הנוחות התפעולית הקיימת, אך האפליקציה והסוכנים מקבלים בסיס אמין לבקרה, החלטה וביצוע.
