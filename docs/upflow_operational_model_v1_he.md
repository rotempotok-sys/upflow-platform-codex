# אפ־פלו — מודל תפעולי קנוני V1

## מטרת המסמך

מסמך זה מגדיר את מודל הנתונים, מקורות האמת, מנגנון הסנכרון, שכבות ההקרנה (projections), והעקרונות להצגת המידע באפליקציה של Upflow.

המטרה היא לעבור ממסכים המחוברים לנתונים חלקיים או heuristic לתמונה תפעולית אמינה, שימושית ומבוססת ישויות וקשרים קנוניים.

---

## 1. עקרונות יסוד

### 1.1 היישות הראשית
היישות הראשית במערכת היא **Operation** — אופרציה / משימה אופרטיבית.

האופרציה יכולה להיות:
- שירות
- פרויקט
- לוגיסטיקה
- רכש
- מכירות
- תיקון ציוד
- נושא כללי

האופרציה עשויה להיוולד מפנייה, אך בפועל היא יחידת העבודה שהעסק מנהל, מתזמן, מבצע, מדווח וסוגר.

### 1.2 תפקיד המערכת
האפליקציה אינה אמורה להיות עותק של Monday, אלא **שכבת שליטה תפעולית** מעל Monday, Google Calendar ושאר המערכות.

המערכת צריכה לאפשר:
- תמונת מצב נוכחית
- היסטוריית פעילות
- זיהוי פערים וחריגות
- תצוגות לפי טכנאי / מתקן / אופרציה
- בסיס לסוכני AI ממליצים ובהמשך אוטונומיים

### 1.3 מקורות אמת
- **Monday** = מקור אמת תפעולי לרוב הישויות העסקיות
- **Google Calendar** = מקור אמת לתזמון בפועל
- **Supabase Postgres** = מאגר הריצה (runtime DB) והזיכרון התפעולי של האפליקציה
- **Google Sheets** = שכבת בקרה/תפעול/סטייג'ינג לפי צורך, לא מקור האמת הראשי של האפליקציה

---

## 2. הזרימה העסקית הראשית

הזרימה הראשית של אופרציה היא:
1. פנייה נכנסת
2. איפיון הצורך מבחינה טכנית
3. שיוך לגורם מבצע או שלב ביניים (רכש / מכירות / לוגיסטיקה)
4. תכנון בלו"ז
5. ביצוע
6. דיווח
7. בקרת איכות
8. סגירה

### הערות חשובות
- לא כל משימה עוברת את כל השלבים.
- יש משימות שמדלגות על פתיחת אופרציה במרכז אופרציה ונכנסות ישירות ללוח זמנים, לרכש או ללוגיסטיקה.
- לא כל האופרציות דורשות שיבוץ לטכנאי שטח.
- דיווח ביצוע קיים רק עבור פעולות שירות, לא בהכרח עבור פרויקטים.

---

## 3. הגדרת אופרציה פתוחה

### 3.1 במרכז אופרציה
שורות פתוחות הן שורות הנמצאות בקבוצות:
- `topics`
- `group_title`

### 3.2 בלו"ז עובדים
משימות פתוחות / פעילות הן משימות בקבוצות:
- `topics`
- `group_mknb6571`
- `new_group_mkmbgrz9`

הגדרת `is_open` הקנונית תיקבע משילוב מצב האופרציה ומצב המשימה בלו"ז, ולא רק משדה יחיד.

---

## 4. מקורות האמת והבורדים המרכזיים

## 4.1 מרכז אופרציה — `1798247340`
**שם הבורד:** מרכז אופרציה  
**מה מייצג item:** פעולה אופרטיבית בעסק (שירות, פרויקט, רכש, תיקון ציוד, מכירות, לוגיסטיקה)  
**תפקיד:** מקור האמת לקיום האופרציה, סוגה, סטטוסה העסקי הראשי, קישור ללקוח וקישורים תפעוליים נוספים.

### שדות חשובים
- `dropdown_mkmm9qzh` — מטרת הפנייה
- `text_mknfh1x1` — מזהה אופרציה
- `color_mkngxc3y` — סטטוס הפנייה (הסטטוס הקובע)
- `connect_boards_mkmmhxe7` — לקוחות פעילים
- `connect_boards_mkn82w54` — לו"ז עובדים
- `board_relation_mm17kvck` — גורם מבצע
- `lookup_mm174zqb` — email (mirror)
- `color_mm17daw5` — execution_status_check

### קביעה
`סטטוס הפנייה` הוא הסטטוס העסקי הראשי של האופרציה.  
`execution_status_check` הוא שדה תפעולי משני ולא ה-lifecycle הראשי.

---

## 4.2 קשר עובדים אפ־פלו — `1729562303`
**שם הבורד:** קשר עובדים אפ-פלו  
**מה מייצג item:** עובד / משתמש פלטפורמה  
**תפקיד:** מקור האמת לזהות משתמש, role, approval והרשאות מסכים.

### שדות חשובים
- `email` — Email איש קשר
- `color_mm16fjq9` — platform role
- `color_mm167kpn` — platform approval
- `status_mkmesmm9` — סטטוס עובד
- `boolean_mm1699jc` — Team
- `boolean_mm1680j8` — Calendar
- `boolean_mm16kwda` — Clients
- `boolean_mm16e9yf` — Equipment
- `boolean_mm16vydm` — Assistant
- `boolean_mm16vdk4` — AI Ask

### כללי הכללה ל-runtime
יש להכניס ל-runtime רק משתמשים שהם:
- בעלי email תקין
- פעילים
- מאושרים
- רלוונטיים למערכת

אין טעם לסנכרן משתמשים חד־פעמיים, ישנים או לא מאושרים.

---

## 4.3 לו"ז עובדים — `1783389345`
**שם הבורד:** לו"ז עובדים - שירות, תחזוקה ופרויקטים  
**מה מייצג item:** משימה מתוזמנת/בביצוע (ביקורת, קריאת שירות, פרויקט, לוגיסטיקה, שירות)  
**תפקיד:** מקור אמת חלקי לתכנון וביצוע. מקור אמת לשיבוץ תפעולי, לא בהכרח לביצוע בפועל לאורך זמן.

### שדות חשובים
- `text_mknfnj59` — מזהה אופרציה
- `dropdown_mkmmb2x` — טכנאי מבצע (legacy)
- `board_relation_mm173tqk` — טכנאי מבצע (future canonical)
- `lookup_mm17dqgp` — אימייל טכנאי (future canonical mirror)
- `date4` — תאריך צפי לביצוע
- `integration` — Google Calendar event
- `status` — סטטוס משימה
- `color_mm17pp1n` — calendar_sync_status
- `color_mm179n1t` — schedule_control_status
- `connect_boards_mkn1c2vc` — דיווח

### קביעה
- ב־V1 יש לתמוך גם ב־`dropdown_mkmmb2x` וגם ב־`lookup_mm17dqgp`.
- הקשר הקנוני לטכנאי צריך לעבור ל־`board_relation_mm173tqk` + `lookup_mm17dqgp`.
- `dropdown_mkmmb2x` יישאר fallback זמני בלבד.

---

## 4.4 לקוחות פעילים — `1284652674`
**מה מייצג item:** לקוח  
**תפקיד:** מקור האמת ללקוחות  
**מזהה לקוח קנוני:** `item_id`

---

## 4.5 תיקי מתקן — `2119399147`
**שם הבורד:** תיקי מתקן  
**מה מייצג item:** מתקן  
**תפקיד:** מקור האמת למתקנים  
**קביעה:** כל מתקן שייך ללקוח אחד.

---

## 4.6 דיווח קריאות, מסירת סחורה ושירות — `1282241018`
**מה מייצג item:** דיווח על פעולה בשטח  
**תפקיד:** מקור האמת לדיווחי ביצוע עבור שירות  
**הערה:** עבור פרויקטים לא תמיד ממולא דוח באותו מנגנון.

### שדות חשובים
- `date4` — תאריך ביצוע בפועל
- `multi_select2` — מי ביצע
- `status_12` — האם הביצוע הצליח
- `status6` — סטטוס QA
- `text_mkmemh8m` — מזהה דיווח / מזהה קישור לאופרציה

### קביעה
בבורד זה מתבצעים גם:
- בקרת איכות
- הפקת דוח ללקוח

---

## 4.7 Google Calendar
יש יומן אחד שממנו נפתחים אירועים לכל האופרציות, והאירוע נשלח למייל הפרטי של הטכנאי לצורך קישור ללוח השנה האישי שלו.

### קביעה
Google Calendar הוא מקור האמת לתזמון בפועל.  
Monday הוא מקור האמת לתכנון ושיוך, אך לא בהכרח לשינויי זמן בפועל.

---

## 5. קטגוריות אופרציה קנוניות

קטגוריית האופרציה תיקבע לפי `dropdown_mkmm9qzh` בבורד מרכז אופרציה.

## 5.1 Service
- יצירת קשר בעניין תחזוקה
- ביקורת תקופתית
- שירות ותחזוקה
- תקלת חשמל
- חשמל

## 5.2 Logistics
- מסירת סחורה
- לוגיסטיקה
- רכש ולוגיסטיקה

## 5.3 Project
- ביצוע חוזה חתום
- משימה עבור פרויקט
- פרוייקטים
- הקמה

## 5.4 Procurement
- רכש

## 5.5 Sales
- פנייה למכירות

## 5.6 Repair
- פריט ציוד לתיקון

## 5.7 General
- נושא כללי

### המלצה
לשמור שני שדות:
- `request_purpose_raw`
- `operation_category`

---

## 6. המודל הקנוני ב-DB

## 6.1 operations
שדות מוצעים:
- `operation_id`
- `operation_item_id`
- `title`
- `description`
- `request_purpose_raw`
- `operation_category`
- `request_status_raw`
- `execution_status_raw`
- `client_item_id`
- `facility_item_id` (nullable)
- `requires_schedule`
- `requires_report`
- `requires_qa`
- `is_open`
- `created_at`
- `closed_at`
- `metadata`

## 6.2 users
- `user_email`
- `display_name`
- `role`
- `approval`
- `employee_status`
- `can_team`
- `can_calendar`
- `can_clients`
- `can_equipment`
- `can_assistant`
- `can_ai_ask`
- `metadata`

## 6.3 clients
- `client_item_id`
- `client_name`
- `metadata`

## 6.4 facilities
- `facility_item_id`
- `facility_name`
- `client_item_id`
- `special_attention_flag`
- `metadata`

## 6.5 schedule_entries
- `schedule_item_id`
- `operation_id`
- `task_type`
- `assigned_user_name_legacy`
- `assigned_user_email`
- `planned_date`
- `calendar_event_ref`
- `schedule_status`
- `calendar_sync_status`
- `schedule_control_status`
- `metadata`

## 6.6 reports
- `report_item_id`
- `operation_id`
- `executed_at`
- `performed_by_raw`
- `report_success_status`
- `qa_status`
- `metadata`

## 6.7 exceptions
חריגות מחושבות, לא mirror ישיר של Monday.

## 6.8 ai_summaries
סיכומי AI על ישויות שונות לאורך זמן.

## 6.9 ai_recommendations
המלצות AI המחכות לאישור אנושי.

## 6.10 approval_queue
תור פעולות מוצעות לאישור ידני.

## 6.11 sync_runs
היסטוריית סנכרון, שגיאות, diagnostics, counts.

## 6.12 raw_events
אירועי ingest גולמיים לשמירת היסטוריה ועקיבות.

---

## 7. קשרים קנוניים

## 7.1 Operation → Client
מקור האמת:
- `connect_boards_mkmmhxe7`

אין להסתמך על שם האייטם כמקור אמת.

## 7.2 Operation → Facility
כרגע אין קשר מפורש מספיק טוב.

### חוק V1
- אם ללקוח יש מתקן יחיד → משייכים אוטומטית
- אם ללקוח יש יותר ממתקן אחד → `facility_item_id = null`
- ונוצרת חריגה `AMBIGUOUS_FACILITY_MAPPING`

### חריג ידוע
קיבוץ גבולות כולל:
- רפת הנגב
- מט"ש גבולות

## 7.3 Operation → Technician
### כיום
- דרך בורד לו"ז עובדים
- `dropdown_mkmmb2x` = fallback legacy

### עתיד קנוני
- `board_relation_mm173tqk`
- `lookup_mm17dqgp`

## 7.4 Operation → Schedule
דרך `text_mknfnj59` בבורד לו"ז עובדים.

## 7.5 Operation → Calendar
דרך `integration` בבורד לו"ז עובדים.

## 7.6 Operation → Report
באמצעות מזהה אופרציה / דיווח כמוגדר בבורדים הרלוונטיים.

## 7.7 Report → QA
דרך `status6`.

---

## 8. כללי סנכרון

## 8.1 כיוון
בשלב זה:
- Monday → DB
- Google Calendar → DB (בעתיד הקרוב)

אין write-back אוטומטי ל-Monday בשלב זה.

## 8.2 תדירות
- סנכרון כל כמה דקות
- אפשרות ל-manual sync
- בהמשך שילוב webhooks למקורות רלוונטיים

## 8.3 שדות חסרים
כאשר שדה קריטי חסר:
- יוצרים רשומה חלקית אם אפשר
- שומרים חריגה
- לא מפילים את כל ה-sync

## 8.4 Conflict resolution
כאשר יש פער בין מקורות:
- דיווח ביצוע משקף את מה שקרה בפועל
- Google Calendar משקף את התזמון בפועל
- Monday משקף את התכנון והניהול
- יש לייצר חריגה, לא לשכתב בשקט

## 8.5 מחיקות
אם בוצעה מחיקה במאנדיי, ניתן למחוק או לארכב ב-DB בהתאם לרמת הסיכון, אך ב-V1 מותר למחוק בהתאם למחיקה במקור.

---

## 9. חריגות (Exceptions) שחייבות להיות במערכת

- `MISSING_TECHNICIAN`
- `MISSING_SCHEDULE`
- `MISSING_CALENDAR_LINK`
- `MISSING_REPORT`
- `OVERDUE_EXECUTION`
- `AMBIGUOUS_FACILITY_MAPPING`
- `ORPHAN_SCHEDULE_ENTRY`
- `ORPHAN_REPORT`
- `REPEAT_FIELD_VISIT`

---

## 10. הגדרת “לא עומד ביעדים”

ב-V1 יש לחשב לפחות 3 כללי אזהרה:

## 10.1 Overdue execution
יש `planned_date`, והמשימה לא הושלמה בזמן.

## 10.2 Missing report
האופרציה דורשת דיווח, אך אין דיווח מקושר.

## 10.3 Repeat field visit
אותה בעיה / אותה שרשרת אופרציה דרשה חזרה לשטח יותר מפעם אחת.

---

## 11. שכבות התצוגה (Projections)

## 11.1 Technician View
כל שורה = משתמש / טכנאי / עובד מבצע.

### להציג
- כמה משימות פתוחות
- כמה משימות מתוכננות לשבוע הקרוב
- כמה משימות באיחור
- כמה משימות ללא דיווח
- כמה משימות בוצעו החודש
- האם הביצועים הצליחו
- כמה חזרות לשטח היו

### חשוב
תצוגה זו לא תכלול מכירות.  
רכש ולוגיסטיקה יוצגו רק אם הם מטופלים בפועל בתצוגת הביצוע הרלוונטית ולא כהעמסת שווא על טכנאי שטח.

## 11.2 Facility View
כל שורה = מתקן.

### להציג
- כמה אופרציות פתוחות
- כמה משימות שירות פתוחות
- כמה דיווחים חסרים
- כמה תקלות חוזרות
- האם יש צורך בטיפול מיוחד
- האם יש חריגות פתוחות

## 11.3 Operation View
כל שורה = אופרציה.

### להציג
- קטגוריה
- לקוח
- מתקן
- טכנאי / אחראי
- סטטוס עסקי
- סטטוס ביצוע
- תכנון
- דיווח
- QA
- חריגות

### חשוב
בתצוגה זו כן יופיעו גם:
- רכש
- לוגיסטיקה
- מכירות
- פרויקטים

## 11.4 Daily / Weekly Control Summary
תצוגת שליטה מהירה ל-30 שניות.

### לענות על
- מה הצוות עושה היום
- מה מתוכנן השבוע
- מה דחוף
- מה באיחור
- מה בלי טכנאי
- מה בלי דיווח
- מה לא עומד ביעדים
- אילו מתקנים או לקוחות בסיכון

---

## 12. תפקיד סוכני AI

## 12.1 שלב נוכחי
הסוכן:
- ממליץ
- מנתח
- מסכם
- מאתר פערים
- מאבחן דפוסים

## 12.2 פעולות
בשלב זה כל פעולה דורשת אישור אנושי.  
הסוכן לא מבצע שינויים אוטונומיים ללא אישור.

## 12.3 מידע שהסוכן צריך לראות
- צורכי הלקוחות
- עומס הצוות
- מה מתוכנן
- מה בוצע
- חריגות
- היסטוריית תקלות
- מקרים ותגובות נפוצים
- מידע טכני
- מידע גיאוגרפי
- מידע עסקי וכלכלי
- תוצאות עבר והמלצות קודמות

## 12.4 מבני נתונים לסוכן
יש לשמור ב-DB גם:
- `ai_summaries`
- `ai_recommendations`
- `approval_queue`
- `action_history`

---

## 13. פערים ידועים במודל V1

## 13.1 שיוך מתקן
הפער הגדול ביותר כיום.  
חייב להיות מטופל באמצעות שיוך מפורש בעתיד.

## 13.2 זיהוי טכנאי
כרגע יש עדיין תלות חלקית ב-dropdown legacy.  
היעד הוא relation + email mirror בלבד.

## 13.3 ייצוג Google Calendar
כרגע רק link נשמר מתוך Monday.  
בעתיד יש לבצע ingest גם מהיומן עצמו.

## 13.4 דיווחים עבור פרויקטים
לא כל פרויקט מייצר דוח שירות, ולכן אסור להחיל לוגיקת דיווח שירות על כל האופרציות.

---

## 14. עקרונות יישום ב-Codex

### 14.1 לא להתחיל מ-UI
תחילה מגדירים מודל קנוני, sync, וקשרים.

### 14.2 לא להמשיך עם heuristics
המסכים צריכים לצרוך projections קנוניים ולא להמציא עומס מתוך fields חלקיים.

### 14.3 לשמור על incremental delivery
לא redesign מלא.  
כל שלב צריך להיות קטן, בדיק, ובר review.

---

## 15. תוכנית עבודה מומלצת

## Phase 1 — Canonical Model
- להגדיר ישויות קנוניות ב-DB:
  - operations
  - users
  - schedule_entries
  - reports
  - exceptions

## Phase 2 — Runtime Sync Expansion
- להרחיב sync ממאנדיי כך שימלא:
  - operations
  - users
  - schedule_entries
  - reports
- להוסיף reconciliation בין הישויות
- להוסיף diagnostics מלאים

## Phase 3 — Exception Engine
- לחשב חריגות קנוניות
- לשמור אותן ב-DB

## Phase 4 — Projections
- לבנות payloads ל:
  - technician view
  - facility view
  - operation view
  - daily/weekly control summary

## Phase 5 — UI Wiring
- לחבר את המסכים ל-projections החדשים
- בלי heuristic mapping

## Phase 6 — AI Context Layer
- לשמור summaries/recommendations/history
- לאפשר approval flow מסודר

## Phase 7 — Calendar Deep Integration
- ingest מיומן Google
- הצלבת planned מול actual

---

## 16. המשימה הבאה המומלצת ל-Codex

```text
Read:
- AGENTS.md
- docs/upflow_monday_system_spec.md
- docs/upflow_information_system_blueprint_he.md
- current runtime sync code
- current Supabase schema
- Team/Calendar frontend files

Context:
- We now have confirmed board mappings for:
  - operations board 1798247340
  - employees board 1729562303
  - schedule board 1783389345
  - clients board 1284652674
  - facilities board 2119399147
  - reports board 1282241018
- The app currently shows partial data but not a true operational picture.
- We need a canonical operational model and runtime projections.

Task:
Design and implement V1 canonical operational model and projections.

Requirements:
1. Define canonical entities for:
   - operations
   - users
   - schedule_entries
   - reports
   - exceptions
2. Normalize operation categories from request purpose values.
3. Reconcile:
   - operation -> client
   - operation -> facility
   - operation -> schedule
   - operation -> technician
   - operation -> report
4. Keep facility mapping nullable and create explicit exceptions for ambiguous client-to-facility cases.
5. Add projections for:
   - technician view
   - facility view
   - operation view
   - daily/weekly control summary
6. Do not redesign UI yet except for minimal DTO/path changes if strictly required.

Return:
1. Proposed schema changes
2. Proposed sync changes
3. Proposed projection payloads
4. Smallest safe implementation order
5. Risks / assumptions
```

---

## 17. סיכום

המערכת הנכונה עבור Upflow אינה עוד דשבורד מחובר חלקית, אלא **חדר בקרה תפעולי** המבוסס על מודל קנוני, סנכרון אמין, חריגות מחושבות, ויכולת לראות:
- מה קורה עכשיו
- מה תוכנן
- מה בוצע
- מה חסר
- מה תקוע
- ומה דורש החלטה ניהולית

זהו הבסיס ההכרחי לפני בניית סוכני AI ניהוליים אפקטיביים.
