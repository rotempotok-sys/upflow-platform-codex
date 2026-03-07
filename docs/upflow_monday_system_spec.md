# מסמך מבנה מערכת במאנדי והנחיות אינטגרציה עם האפליקציה

## מטרת המסמך
המסמך מגדיר את מבנה העבודה הקיים במאנדי עבור תפעול, שיבוץ, יומן, דיווח, בקרה והרשאות משתמשים, ומפרט איך האפליקציה צריכה להשתלב נכון עם המבנה הקיים בלי לשבור את התהליך.

העיקרון המנחה: לא בונים מערכת חדשה מאפס, אלא מחזקים ומחברים נכון את המערכת הקיימת.

---

## עקרונות על

### 1. Source of Truth לפי שכבה
- **מרכז אופרציה** – מקור האמת לפתיחת משימה, שיוך ראשוני, ובקרה ניהולית על הזרימה
- **לו"ז עובדים** – מקור האמת לביצוע בפועל, תזמון, שיוך טכנאי, קישור ליומן וקישור לדיווח
- **Google Calendar** – שכבת זימון ותצוגת זמן, לא מקור אמת עיקרי לזהות המשימה
- **בורד דיווחים** – מקור אמת לדיווח ביצוע, QA והמשך לחיוב
- **בורד קשר עובדים** – מקור אמת להרשאות, roles, טוגלס ושיוכי משתמשים

### 2. האפליקציה אינה מחליפה את Monday
האפליקציה היא שכבת שליטה, בקרה, הרשאות ו־visibility מעל Monday והאינטגרציות שלו.

### 3. אין להסתמך על parsing של כותרת אירוע ביומן כמנגנון זיהוי ראשי
שיוך משתמשים, הרשאות ותצוגות צריכים להתבסס על שדות מפורשים בבורדים, לא על טקסט חופשי.

### 4. Fail-closed
כאשר שיוך, הרשאה או קישור חסרים או לא חד־משמעיים – האפליקציה צריכה להעדיף חסימה/ריק/חריגה ולא חשיפת מידע עודף.

---

## מפת הבורדים במערכת

### 1. בורד קשר עובדים אפ-פלו
**Board ID:** `1729562303`

#### תפקיד במערכת
ניהול משתמשים, הרשאות, roles, סטטוס אישור, והגדרת גישה למסכים ולישויות.

#### שדות מרכזיים
- `email` – אימייל המשתמש
- `item` – שם משתמש
- `phone_mkn2my3a` – טלפון
- `color_mm16fjq9` – platform role
- `color_mm167kpn` – platform approval
- `boolean_mm16vydm` – Assistant
- `boolean_mm1680j8` – Calendar
- `boolean_mm16kwda` – Clients
- `boolean_mm1699jc` – Team
- `boolean_mm16e9yf` – Equipment
- `boolean_mm16vdk4` – AI Ask
- `board_relation_mm172f5y` – Assigned Clients
- `board_relation_mm17fgf6` – Assigned Facilities

#### ערכי role מאושרים
- `Admin`
- `Operations`
- `Technician`
- `Viewer`

#### ערכי approval מאושרים
- `Pending`
- `Approved`
- `Blocked`

#### תפקיד באפליקציה
- מקור אמת ל־auth/authz
- מקור אמת לשיוך לקוחות ומתקנים
- מקור אמת לטוגלס של מסכים והרשאות
- סינון API ו־UI לפי משתמש מחובר

---

### 2. מרכז אופרציה
**Board ID:** `26722321`

#### תפקיד במערכת
פתיחת משימות חדשות, ניהול pipeline תפעולי, שיוך ראשוני ובקרה ניהולית רוחבית.

#### שדות מרכזיים שנבדקו/אושרו
- `text_mknfh1x1` – ID מקוצר
- `board_relation_mm17kvck` – גורם מבצע (connected לבורד עובדים)
- `lookup_mm174zqb` – אימייל של העובד/טכנאי המשויך
- `lookup_mkna8q32` – סטטוס משימה מעודכן מבורד לו"ז עובדים
- `connect_boards_mkn82w54` – קישור לבורד לו"ז עובדים
- `lookup_mm17kybq` – קישור לאירוע Google Calendar, נמשך מבורד לו"ז עובדים
- `numbers_mkmvq21y` – מזהה דיווח 4 ספרות
- `color_mm17daw5` – execution_status_check

#### תפקיד באפליקציה
- מסך Control ראשי לניהול המשימות
- הצגת מצב משימה אחד־על־אחד לאורך כל הזרימה
- זיהוי חריגות ברמת הנהלה/אופרציה

#### הנחיה חשובה
העמודה `lookup_mm174zqb` היא מקור אמת טוב יותר לשיוך טכנאי מאשר שם חופשי ביומן או בכותרת.

---

### 3. לו"ז עובדים – שירות, תחזוקה ופרויקטים
**Board ID:** `1783389345`

#### תפקיד במערכת
ניהול משימות בביצוע, שיבוץ טכנאים, תזמון, קישור ליומן, וקישור לדיווח.

#### שדות מרכזיים קיימים
- `status` – סטטוס משימה
- `dropdown_mkn9g57j` – סוג המשימה
- `dropdown_mkmmb2x` – טכנאי מבצע
- `date4` – תאריך צפי לביצוע
- `button_mkmvfpam` – יצירה/עדכון אירוע
- `integration` – Google Calendar event
- `text_mknfnj59` – מזהה אופרציה
- `text_mkng3yg0` – מזהה מקומי
- `text_mkmm204g` – מזהה נודד
- `link_to______________mkn893nm` – קישור למרכז אופרציה
- `connect_boards_mkn1c2vc` – דיווח
- `lookup_mkn83bsv` – בקרת איכות
- `mirror_mkn8qmaf` – סטטוס קריאה
- `lookup_mknapxg0` – תיאור הדיווח
- `lookup_mkq2mjac` – תאריך ביצוע בפועל

#### שדות שנוספו לשיפור האינטגרציה
- `board_relation_mm173tqk` – connected board לטכנאי/עובד
- `lookup_mm17dqgp` – אימייל טכנאי mirrored
- `color_mm17pp1n` – calendar_sync_status
- `color_mm179n1t` – schedule_control_status

#### תפקיד באפליקציה
- מקור אמת לביצוע בפועל
- מקור אמת לתצוגת לוח זמנים לטכנאי
- מקור אמת לקישור בין משימה, יומן ודיווח
- מסך Technician schedule / operations scheduling / exceptions

#### הנחיות חשובות
- `lookup_mm17dqgp` ישמש כמקור האמת הראשי לזיהוי טכנאי עבור הרשאות ותצוגת לוח זמנים
- אין להסתמך על `dropdown_mkmmb2x` כבסיס authz, רק ככלי עבודה אנושי/legacy
- `color_mm17pp1n` ישמש להצגת מצב סנכרון ליומן
- `color_mm179n1t` ישמש לבקרת flow תפעולית בלו"ז

---

### 4. בורד דיווח קריאות, מסירת סחורה ושירות
**Board ID:** `1282241018`

#### תפקיד במערכת
דיווח ביצוע, QA, בקרה איכותית, והזנה לחיוב ודוח ללקוח.

#### שדות מרכזיים
- `text_mkmemh8m` – מזהה האופרציה
- `connect_boards_1_mkmxq34v` – קישור ללו"ז טכנאים
- `lookup_mm171ygf` – אימייל טכנאי mirrored
- `status_12` – סטטוס קריאה / flow תפעולי
- `date4` – תאריך ביצוע בפועל
- `status6` – סטטוס בקרת איכות
- `dropdown__1` – לחיוב הלקוח
- `single_select` – אפיון הקריאה
- `long_text9` – תיאור התקלה/העבודה
- `multi_select2` – שם מבצע
- `connect_boards4` – קישור ללקוח

#### תפקיד באפליקציה
- מקור אמת לדיווח ביצוע
- מקור אמת ל־QA status
- מקור לאיתור דיווחים חסרים/ממתינים/בעייתיים
- תצוגת דיווחים לטכנאי לפי email

#### הנחיות חשובות
- `text_mkmemh8m` הוא מזהה האופרציה – אין צורך בשדה נוסף מקביל כרגע
- `lookup_mm171ygf` ישמש כמקור אמת לטכנאי בדיווחים
- `status_12` ישמש כבקרה תפעולית flow-level
- `date4` ישמש כתאריך ביצוע בפועל

---

## Google Calendar
**Calendar:** `upflow.operations@gmail.com`

#### תפקיד במערכת
שכבת זימון, תיאום ושינוי זמן בפועל.

#### עיקרון עבודה נכון
- האירוע ביומן אינו מקור האמת הראשי לטכנאי או לזהות המשימה
- השיוך באפליקציה יתבסס על Monday, בעיקר דרך בורד לו"ז עובדים
- Calendar הוא שכבת תצוגה/עדכון זמן/הזמנה

#### הנחיות לאינטגרציה
- Admin/Operations רואים את כל האירועים הרלוונטיים
- Technician רואה רק אירועים הקשורים לשורות בלו"ז עובדים שבהן `lookup_mm17dqgp == user.email`
- אין לבסס את הסינון הראשי על שם האירוע או attendee parsing, אלא על הקישור בין המשימה בלו"ז לבין האירוע
- אם אין קישור חד־משמעי ליומן – להציג חריגה, לא לנחש

---

## לוגיקת הרשאות באפליקציה

### Roles
- **Admin** – גישה מלאה
- **Operations** – גישה מלאה תפעולית, ללא ניהול Admin אחרים
- **Technician** – גישה רק למה שמשויך אליו
- **Viewer** – גישה קריאה בלבד לפי scope

### כללי תצוגה
- Admin / Operations:
  - רואים כל הלקוחות
  - רואים כל המתקנים
  - רואים כל משימות הלו"ז
  - רואים כל הדיווחים
  - רואים כל לוחות הזמנים
- Technician:
  - רואה רק clients/facilities לפי assignment מבורד עובדים
  - רואה רק משימות לו"ז שבהן `lookup_mm17dqgp == user.email`
  - רואה רק דיווחים שבהם `lookup_mm171ygf == user.email`
  - רואה רק משימות/מסכים שמאופשרים לו בטוגלס

### כללי אכיפה
- כל סינון חייב להיאכף קודם ב־API
- ה־UI הוא שכבת תצוגה בלבד
- אם נתוני שיוך/הרשאה חסרים או לא ניתנים לפיענוח – fail closed

---

## מיפוי עמודות קריטיות לאינטגרציה

### בורד עובדים – env/auth mappings
- `AUTH_TOGGLE_ASSISTANT_COLUMN_ID=boolean_mm16vydm`
- `AUTH_TOGGLE_CALENDAR_COLUMN_ID=boolean_mm1680j8`
- `AUTH_TOGGLE_CLIENTS_COLUMN_ID=boolean_mm16kwda`
- `AUTH_TOGGLE_TEAM_COLUMN_ID=boolean_mm1699jc`
- `AUTH_TOGGLE_EQUIPMENT_COLUMN_ID=boolean_mm16e9yf`
- `AUTH_TOGGLE_AI_ASK_COLUMN_ID=boolean_mm16vdk4`
- `AUTH_ASSIGNED_CLIENTS_COLUMN_ID=board_relation_mm172f5y`
- `AUTH_ASSIGNED_FACILITIES_COLUMN_ID=board_relation_mm17fgf6`

### לו"ז עובדים – technician visibility
- `board_relation_mm173tqk` – employee link
- `lookup_mm17dqgp` – technician email
- `color_mm17pp1n` – calendar_sync_status
- `color_mm179n1t` – schedule_control_status

### דיווחים – report visibility
- `text_mkmemh8m` – operation id
- `lookup_mm171ygf` – technician email
- `status_12` – flow status
- `date4` – actual execution date
- `status6` – QA status
- `connect_boards_1_mkmxq34v` – linked schedule item

---

## הנחיות אינטגרציה לאפליקציה

### 1. Monday הוא מקור האמת, לא ה־frontend
האפליקציה לא תשמור עותקים “נוחים” שמשנים אמת עסקית. כל מידע תפעולי משמעותי ייגזר מ־Monday.

### 2. אין להציג fallback מלא למשתמש לא מורשה
אם שליפת נתונים נכשלת או המשתמש לא מורשה – להציג ריק/מצב שגיאה/מסך auth, לא נתוני demo/fallback מלאים.

### 3. כל מסך צריך להסתמך על source of truth ברור
- הרשאות → בורד עובדים
- משימות ניהול → מרכז אופרציה
- ביצוע ולו"ז → לו"ז עובדים
- דיווח ו־QA → בורד דיווחים

### 4. כל join בין בורדים צריך להיות מפורש
אין להסתמך על matching רופף של טקסט, שמות או titles, אלא על שדות מזהה, board relations ו־mirrors.

### 5. אם יש ambiguity – להציג חריגה
לא “לתקן לבד” ולא לנחש. הדגל הנכון הוא Exception.

### 6. סינון משתמשים
- Technician filtering צריך להתבסס על email mirrored, לא על labels ידניים
- כל API רלוונטי צריך לקבל את המשתמש המחובר ולסנן בשרת

### 7. Calendar integration
- יש לשמור שהיומן לא ישמש כמקור אמת יחיד
- אם יש אירוע יומן ללא התאמה ברורה למשימה בלו"ז – יש לסמן mismatch

---

## תצוגות מומלצות באפליקציה

### 1. Operations Control
טבלת שליטה מרכזית על בסיס מרכז אופרציה, עם joins ללו"ז, Calendar ודיווחים.

להציג:
- מזהה קצר
- טכנאי משויך
- אימייל טכנאי
- סטטוס execution
- האם יש שורת לו"ז
- האם יש קישור יומן
- האם יש דיווח
- QA status
- חריגות

### 2. Employees Schedule / Technician View
- Admin / Operations: כל השורות
- Technician: רק שורות עם `lookup_mm17dqgp == user.email`
- שימוש ב־calendar_sync_status ו־schedule_control_status להצגת בקרה

### 3. Reports View
- Admin / Operations: כל הדיווחים
- Technician: רק דיווחים עם `lookup_mm171ygf == user.email`
- שימוש ב־status_12 ו־status6 לזיהוי מצב flow ו־QA

### 4. Exceptions View
הצגה מרוכזת של חריגות:
- משימה בלי טכנאי
- משימה בלי לו"ז
- שורת לו"ז בלי קישור ליומן
- דיווח בלי מזהה אופרציה
- דיווח בלי טכנאי
- `נדרש ביקור נוסף`
- `פנייה למכירות`
- `בוצע בהצלחה` אבל עדיין `ממתין לביקורת`
- calendar sync error
- mismatch בין מרכז אופרציה, לו"ז ודיווח

---

## לוגיקות בקרה מומלצות

### execution_status_check במרכז אופרציה
הצעה ללוגיקה:
- אין גורם מבצע → `Needs Assignment`
- יש גורם מבצע ואין שורת לו"ז → `Needs Scheduling`
- יש שורת לו"ז ואין אירוע יומן → `Exception`
- יש לו"ז ויש יומן → `Scheduled`
- בוצע ואין דיווח → `Waiting for Report`
- יש דיווח → `Under Review`
- QA עבר → `Closed`
- mismatch בין שכבות → `Exception`

### schedule_control_status בלו"ז עובדים
להשתמש בבורד זה לייצוג בקרה תפעולית פנימית, למשל:
- `Needs Technician`
- `Needs Calendar Event`
- `Scheduled`
- `Executed`
- `Waiting for Report`
- `Linked to Report`
- `Exception`

### calendar_sync_status בלו"ז עובדים
- `Not Created`
- `Created`
- `Updated`
- `Error`
- `Missing Link`

---

## מגבלות ידועות במערכת הנוכחית

1. חלק מהזרימה עדיין נשענת על היסטוריה ו־legacy fields
2. יש כמה מזהים מקבילים במספר בורדים, ולכן חשוב לקבוע שדה מלך לכל שכבה
3. Google Calendar עדיין מכיל שונות מסוימת בתוכן האירועים
4. חלק מהחיבורים לדיווחים בעבר נעשו דרך מספרים קצרים והצלבות, ולכן נדרש להעדיף תמיד board relations כשקיימים
5. יש צורך באכיפת consistency דרך האפליקציה והאוטומציות, לא רק דרך Monday

---

## המלצות עבודה ותפעול

### 1. לא להוסיף עוד עמודות בלי צורך אמיתי
המבנה הקיים כבר מספיק עשיר. עכשיו עדיף להשתמש נכון במה שכבר קיים.

### 2. כל שינוי מבני חדש חייב לעבור דרך שאלת Source of Truth
לפני כל שדה חדש, לשאול: איזה שדה קיים כבר עושה את זה טוב מספיק?

### 3. בעיות אינטגרציה שלא נפתרות תוך 1–2 איטרציות
לעבור לחיפוש מקורות חיצוניים, דוקס ורפרנסים, במקום להיתקע בלופ ניחושים.

### 4. עדיפות לפתרונות מינימליים ומודולריים
לא לשבור flows עובדים, אלא להקשיח, לחשוף חריגות ולשפר בקרה.

---

## סיכום
המבנה במאנדי כבר חזק מספיק כדי לתמוך באפליקציה תפעולית טובה מאוד.
העבודה הנכונה עכשיו אינה לבנות מחדש, אלא:
- להישען נכון על Source of Truth בכל שכבה
- לאכוף הרשאות וסינון בשרת
- לחבר בין הבורדים לפי שדות קיימים ומוגדרים היטב
- לבנות באפליקציה שכבות Control, Schedule, Reports ו־Exceptions
- להעדיף בקרה ו־visibility על פני overengineering

