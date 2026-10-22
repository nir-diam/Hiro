# Public Jobs API (`/api/public/v1`)

ממשק שרת-לשרת לאתרי קריירה. הדפדפן לא קורא ל-Hiro. כל בקשה נשלחת עם `X-Hiro-Site-Key`.

הדוגמאות למטה הן הפלט של הסריאליזר (מכוסות בבדיקות `backend/src/utils/__tests__/publicJobsApi.test.js`). הן לא dump משרת הייצור.

| פריט | ערך |
| --- | --- |
| Mount | `app.use('/api/public/v1', …)` |
| Auth | `X-Hiro-Site-Key` על כל הנתיבים, כולל `/health` |
| ניהול אתרים | הגדרות ← חברה ← **אתרי משרות** (מנהל מערכת). `GET/POST /api/public-sites` |

מפתח משויך ל**אתר**, לא רק לארגון:

| היקף | מי רואה |
| --- | --- |
| `aggregator` | משרות של ארגונים עם `metadata.publishOnHiroBoard !== false` שסומנו לאתר הזה |
| `tenant` | רק משרות של `clientId` של האתר, שסומנו לאתר הזה |

שני מפתחות יכולים להיות פעילים יחד (החלפה בלי השבתה). ביטול הוא `POST /api/public-sites/:id/keys/:keyId/revoke`. המפתח המלא וה-webhook secret מוצגים פעם אחת ביצירה.

מפתחות מ-`PUBLIC_SITE_KEYS` / `PUBLIC_SITE_AGGREGATOR_KEY` נשארים לגיבוי פיתוח. בלי `siteId` הם עובדים לפי הדגל הישן `publishToGeneralBoard`.

בלי מפתח: **401**

```json
{ "message": "Invalid or missing site key", "code": "INVALID_SITE_KEY" }
```

---

## מיפוי שדות — מצב בפועל

| שדה באתר | מקור | מצב |
| --- | --- | --- |
| `title` | `publicJobTitle`, ואם ריק כותרת המשרה | קיים |
| `jobNumber` | `publicationCode`, ואם ריק `postingCode` | קיים. זה לא מספר המשרה הפנימי |
| `slug` | `publicBoard.publicSlug`. נוצר בשמירת פרסום ראשונה מכותרת + עיר + קוד, ולא משתנה אחר כך | חדש, אוטומטי, נשמר |
| `category` | תחום (`job.field` / `jobFields.fieldType` = `job_clusters`) | קיים. `publicSlug` נשמר וננעל. שינוי שם בעברית לא משנה אותו. `slugAliases` לאיחוד |
| `cluster` | הקבוצה (`job_categories`, האב של התחום) | קיים, עם אותו מנגנון slug |
| `role` | `job.role` | קיים |
| `industry` | `organizations.mainField` | קיים כשיש ארגון מקושר. אין קטלוג תעשיות נפרד מעבר לערך הזה |
| `locations` | עיר המשרה + אזור. lat/lng מקטלוג הערים. רחוב רק אם `showAddress` | קיים חלקית. אין עדיין lat/lng מ"כתובת להגעה" של הלקוח |
| `employmentType` | `job.jobType`, ממופה ל-`full_time` / `part_time` / `shifts` / `temporary` / `freelance` | קיים |
| `workModel` | `publicBoard.workModel`. ברירת מחדל `office` / מהמשרד | שדה חדש אופציונלי |
| `startDate` | `job.availability` | קיים |
| `urgent` | עדיפות דחופה או קריטית | קיים |
| `experienceYearsMin` / `noExperience` | `publicBoard` אם מולא, אחרת נגזר מהטקסט (`3 שנות`, `ללא ניסיון`) | נגזר, ניתן לתיקון בשמירת `publicBoard` |
| `seniority` | נגזר משנות ניסיון + האם התפקיד ניהולי | נגזר. לא שדה הזנה |
| `skills` | `job.skills` מסוג skill, עד 8, חובה קודם | קיים |
| `requirements` | תגיות חובה + `job.requirements` + דרישות הפרסום | קיים |
| `description` | תיאור הפרסום | קיים |
| `responsibilities` / `niceToHave` / `benefits` | `publicBoard` אחרי שהרכזת שמרה ניסוח | השדות קיימים. כפתור "נסח לפרסום בעזרת AI" עדיין לא נבנה |
| `teaser` | `publicBoard.teaser` או 180 התווים הראשונים של התיאור | נגזר |
| `salary` | `salaryMin`/`salaryMax` **רק** כש-`publicBoard.publishSalary === true`. כבוי כברירת מחדל | קיים. המפתחות הפנימיים `salaryMin`/`salaryMax` לא יוצאים החוצה |
| `suitableFor` | `publicBoard.suitableFor` | חדש, אופציונלי |
| `hoursDescription` | `publicBoard.hoursDescription`, ואם ריק משפט שעות/משמרות מהתיאור | אופציונלי + גזירה פשוטה. לא מודל AI |
| רישיון, הסמכות, שפות, השכלה | דרך `requirements` / `skills` | קיים, לא שדות נפרדים |
| `validThrough` | `openDate` + `validityDays` | קיים |
| `imageUrl` | `heroImageUrl`. במצב חסוי עם מותג לקוח על התמונה הכתובת לא מוחזרת | קיים |
| `recruiter` | המילה הראשונה של `job.recruiter`. אין תמונת רכזת על המשרה | חלקי: שם פרטי בלבד, `imageUrl: null` |
| `apply.questions` | `screeningQuestions`. `video` מסומן `completeInPortal` ולא חוסם את הטופס | קיים |
| `company` | ארגון המעסיק, או מעטפה חסויה. ראו למטה | קיים |
| `status` | `open` אם הסטטוס מסומן להופיע באתר | ברירת מחדל: `פתוחה`/`פעילה` כן, השאר לא. דריסה ב-`clients.metadata.publicJobStatusVisibility` |
| `publishedAt` | `publicBoard.publishedAt` או `openDate` | קיים. השם הישן `postedAt` לא מוחזר |

Slug של תחום, קבוצה ועיר נוצר פעם אחת מתעתיק לטיני (`buildStableSlug`) ונשמר. שינוי השם בעברית לא משנה אותו. איחוד: לכתוב את ה-slug הישן ל-`slugAliases`. הפילטר והטקסונומיה מכבדים alias. הפניית 301 היא באתר.

---

## לקוח חסוי

אותה הגדרה כמו "מקור מותג בתמונות משרה" (`clients.metadata.jobHeroBrandSource`):

- `company` (ברירת מחדל) — המעסיק חסוי
- `job_client` — השם גלוי
- `choice` — לפי `heroBrandSource` של המשרה
- עקיפה למשרה: `publicBoard.showClientName: true`

במצב חסוי אין בתשובה שם, id, לוגו או אתר של המעסיק. `googleForJobs.hiringOrganization` הוא הסוכנות המפרסמת. `GET /companies/:slug` מחזיר 404 ללקוח חסוי, וה-slug לא נגזר משמו.

```json
{
  "confidential": true,
  "displayName": "חברת לוגיסטיקה מובילה במרכז",
  "industry": "לוגיסטיקה",
  "sizeRange": "201-1000",
  "publisher": { "name": "מימד אנושי", "logoUrl": "https://cdn.example/mimad.png", "slug": "humand" }
}
```

שם תצוגה נגזר מתעשייה + אזור. `publicBoard.confidentialDisplayName` דורס אותו.

---

## `GET /jobs`

פרמטרים: `q`, `cluster`, `category`, `industry`, `city`, `region`, `employmentType`, `workModel`, `seniority`, `noExperience`, `suitableFor`, `salaryMin`, `postedWithin`, `companySlug`, `sort` (`newest` | `oldest` | `salary` | `relevance`), `page`, `limit` (1–50), `facets` (ברירת מחדל כן; `facets=0` בלי ספירות).

ערכים מרובים באותו פרמטר מופרדים בפסיק (OR).

`q` מחפש בכותרת, תיאור, כישורים, דרישות, תפקיד, ושם חברה רק אם היא לא חסויה. מילים נרחבות לפי `synonyms` / `aliases` בקטלוג התגיות, כך ש"הנהלת חשבונות" מוצאת משרה עם התגית "מנהל/ת חשבונות".

כל ספירת facet מחושבת בלי הפילטר של אותה קבוצה.

```json
{
  "items": [
    {
      "id": "job-1",
      "slug": "mkhsnai-t-lmsmrvt-ptkh-tkvh-pub-9",
      "title": "מחסנאי/ת למשמרות",
      "jobNumber": "PUB-9",
      "category": { "slug": "warehouse", "label": "מחסן והפצה" },
      "cluster": { "slug": "logistics", "label": "לוגיסטיקה" },
      "role": { "slug": "mkhsnai", "label": "מחסנאי" },
      "industry": { "slug": "lvgiistiq", "label": "לוגיסטיקה" },
      "locations": [
        {
          "city": "פתח תקווה",
          "citySlug": "petah-tikva",
          "region": "מרכז",
          "regionSlug": "center",
          "label": "פתח תקווה, מרכז",
          "address": null,
          "lat": 32.08,
          "lng": 34.88
        }
      ],
      "employmentType": [{ "value": "full_time", "label": "משרה מלאה" }],
      "workModel": { "value": "office", "label": "מהמשרד" },
      "urgent": true,
      "teaser": "מגייסת מחסנאי. 3 שנות ניסיון.",
      "salary": null,
      "imageUrl": "https://cdn.example/hero.png",
      "company": {
        "confidential": true,
        "displayName": "חברת לוגיסטיקה מובילה במרכז",
        "industry": "לוגיסטיקה",
        "sizeRange": "201-1000",
        "publisher": { "name": "מימד אנושי", "logoUrl": "https://cdn.example/mimad.png", "slug": "humand" }
      },
      "status": "open",
      "updatedAt": "2026-10-18T00:00:00.000Z",
      "publishedAt": "2026-10-01T00:00:00.000Z",
      "skills": [{ "label": "מנהל/ת חשבונות", "required": true }],
      "hoursDescription": "שעות א-ה 07:00-16:00",
      "suitableFor": [],
      "experienceYearsMin": 3,
      "noExperience": false,
      "seniority": { "value": "mid", "label": "בינוני" },
      "validThrough": "2026-10-31T00:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "facets": {
    "cluster": { "logistics": 1 },
    "category": { "warehouse": 1 },
    "city": { "petah-tikva": 1 },
    "region": { "center": 1 },
    "employmentType": { "full_time": 1 },
    "workModel": { "office": 1 },
    "seniority": { "mid": 1 },
    "industry": {},
    "suitableFor": {},
    "companySlug": {}
  }
}
```

כש-`publishSalary` דלוק, `salary` הוא `{ "min": 8000, "max": 12000, "currency": "ILS", "period": "month" }`.

Cache: `public, max-age=60`.

---

## `GET /jobs/:slugOrId`

כל שדות הרשימה, ובנוסף:

`description`, `responsibilities`, `niceToHave`, `benefits`, `requirements`, `startDate`, `recruiter` (`{ firstName, imageUrl }`), `apply.questions`, `googleForJobs`.

שאלות:

| `type` | מקור |
| --- | --- |
| `yes_no` | כן/לא |
| `text` | טקסט |
| `number` | מספר |
| `choice` | בחירה. `options` הוא מערך תוויות |
| `video` | לא בטופס האתר. `completeInPortal: true` ו-`required: false` |

```json
{
  "apply": {
    "questions": [
      { "id": "1", "type": "yes_no", "label": "יש רישיון?", "required": true, "options": [], "completeInPortal": false },
      { "id": "2", "type": "video", "label": "ספרו על עצמכם", "required": false, "options": [], "completeInPortal": true }
    ]
  },
  "googleForJobs": {
    "hiringOrganization": { "name": "מימד אנושי", "logo": "https://cdn.example/mimad.png", "sameAs": null },
    "jobLocation": { "addressLocality": "פתח תקווה", "addressRegion": "מרכז", "streetAddress": null, "addressCountry": "IL" }
  }
}
```

| סטטוס | מתי |
| --- | --- |
| 200 `status: "open"` | מפורסמת לאתר הזה והסטטוס מסומן להופיע |
| 200 `status: "closed"` | הייתה מפורסמת וירדה, ועדיין בתוך 30 יום |
| 410 `JOB_CLOSED` | אחרי 30 יום |
| 404 `NOT_FOUND` | לא קיימת, לא פורסמה, או לא באתר הזה |

ההגשה נחסמת מיד ב-410 גם בתוך חלון 30 הימים.

---

## `GET /taxonomy`

```json
{
  "clusters": [
    {
      "slug": "logistics",
      "label": "לוגיסטיקה ושרשרת אספקה",
      "count": 70,
      "aliases": [],
      "categories": [
        { "slug": "warehouse", "label": "מחסן והפצה", "count": 31, "synonyms": ["מחסנאי/ת", "ליקוט"], "aliases": ["old-warehouse"] }
      ]
    }
  ],
  "industries": [{ "slug": "lvgiistiq", "label": "לוגיסטיקה", "count": 12 }],
  "regions": [
    {
      "slug": "center",
      "label": "מרכז",
      "count": 210,
      "cities": [{ "slug": "petah-tikva", "label": "פתח תקווה", "count": 22, "lat": 32.08, "lng": 34.88, "aliases": [] }]
    }
  ],
  "employmentTypes": [{ "value": "full_time", "label": "משרה מלאה", "count": 300 }],
  "workModels": [{ "value": "office", "label": "מהמשרד", "count": 10 }],
  "seniorities": [{ "value": "mid", "label": "בינוני", "count": 4 }],
  "suitableFor": [{ "value": "students", "label": "סטודנטים", "count": 0 }],
  "marketingTags": [{ "value": "urgent", "label": "דחוף", "count": 2 }]
}
```

`count` הוא משרות פתוחות ומפורסמות **למפתח הנוכחי**. תחום עם 0 עדיין חוזר. תוויות ה-enum בעברית מגיעות מהשרת.

במודל Hiro, `job_categories` הוא ה-cluster (הקבוצה) ו-`job_clusters` הוא ה-category (התחום).

---

## `GET /companies/:slug`

רק מעסיק לא-חסוי. הגוף הוא אובייקט `company` בתוספת `jobs` (צורת פריט רשימה). 404 אם אין משרות גלויות עם ה-slug.

## `GET /jobs/:id/similar?limit=6`

משרות אחרות באותו אתר. אם יש embeddings, הדירוג הוא cosine. בלי וקטור — אותו תחום ואז אותה עיר. אין שדות פנימיים ואין זהות של מעסיק חסוי.

## `GET /sitemap/jobs`

```json
{ "items": [{ "slug": "…", "updatedAt": "…" }] }
```

רק משרות שמופיעות עכשיו. בלי שם מעסיק.

## `POST /jobs/:id/view`

```json
{ "channel": "google" }
```

תשובה: `{ "ok": true }`.

## `POST /jobs/:id/applications`

נכנסת ל-`jobPublicationService.submitApplication`: איתור מועמד לפי מייל או טלפון, בלי כפילות, שיוך למשרה בסטטוס "חדש", פרסור קו"ח אם צורף קובץ, ומקור גיוס מטבלת מקורות הגיוס (נוצר אם חסר). `utm` נשמר ב-`workflowMeta` ולא הופך למקור.

שני פורמטים מתקבלים. המועדף הוא `multipart/form-data`, כי קובץ של 5MB ב-base64 תופח לכ-6.7MB של JSON.

- `multipart/form-data`: שדות טקסט, וקובץ בשדה `cv` (שם הקובץ מה-`filename`). שדות שהם אובייקט (`consent`, `optIns`, `utm`, `answers`) נשלחים כמחרוזת JSON.
- `application/json`: אותו מבנה שדות, והקובץ ב-`cv.contentBase64` (עם `cv.filename`). נשאר נתמך.

| שדה | כלל |
| --- | --- |
| `fullName` | חובה |
| `phone` | חובה. מנורמל ל-`05XXXXXXXX` |
| `email` | לא חובה |
| `cv` | אופציונלי. PDF/DOC/DOCX עד 5MB לפי חתימת הקובץ, לא לפי הסיומת |
| `answers` | מפת מזהה שאלה → תשובה. שאלת וידאו לא נדרשת כאן |
| `consent` | `{ "accepted": true, "policyVersion": "2026-10-01", "policyUrl": "https://…" }` |
| `optIns` | `{ "otherJobs": false, "candidatePool": false }` |
| `utm` | `utm_source`, `utm_medium`, `utm_campaign` |

מקור הגיוס: "אתר Hiro" למאגד, או `recruitmentSourceName` של האתר, או `אתר {שם הארגון}`.

אתר בסביבת `test`: ההגשה נשמרת עם `workflowMeta.testSubmission: true` ולא משוגרת לנמען הנוסף.

| סטטוס | קוד |
| --- | --- |
| 201 | `{ "applicationId": "…" }` |
| 404 | `NOT_FOUND` |
| 409 | `ALREADY_APPLIED` |
| 410 | `JOB_CLOSED` |
| 422 | `VALIDATION` ו-`field` (`fullName`, `phone`, `email`, `cv`, `consent`, `answers`) |
| 429 | `RATE_LIMITED` — 5 לטלפון ו-30 ל-IP בשעה. ה-IP נלקח מ-`X-Forwarded-For` |

---

## Webhook

`POST {webhookUrl}` עם `X-Hiro-Signature` = HMAC-SHA256 hex של גוף ה-JSON. החתימה היא ב-**webhook secret** של האתר (המחרוזת שמוצגת פעם אחת ביצירת האתר או ב-`POST /api/public-sites/:id/webhook-secret`). לא במפתח `X-Hiro-Site-Key`.

```json
{ "event": "job.published", "sentAt": "2026-10-21T10:00:00.000Z", "jobId": "…", "slug": "…" }
```

אירועים: `job.published`, `job.updated`, `job.closed`, `taxonomy.updated`, `company.updated`.

נשלח רק לאתרים שהמשרה רלוונטית להם. ארבעה ניסיונות: מיד, אחרי 10 שניות, אחרי דקה, ואחרי 5 דקות. כשל נרשם ב-`public_site_webhook_deliveries` ולא חוסם שמירה. הלוג זמין במסך אתרי המשרות. אם התהליך עולה מחדש באמצע ההמתנה, הניסיון שנשאר לא נשלח.

---

## מה עדיין לא במסך הפרסום

- כפתור "נסח לפרסום בעזרת AI" שמפצל תיאור / אחריות / דרישות / יתרון / הטבות
- תצוגה מקדימה של עמוד האתר
- מונה צפיות והגשות על הטאב (המונים קיימים על רשומת הפרסום)

מפתחות בדיקה ומשרות בדיקה נוצרים במסך "אתרי משרות" אחרי עליית השרת עם המיגרציה. אי אפשר להנפיק מכאן מפתח ל-`api.hiro.co.il` בלי להריץ את זה על בסיס הנתונים של הסביבה.
