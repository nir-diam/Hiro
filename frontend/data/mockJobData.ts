// data/mockJobData.ts

export const mockJobCandidates = [
  { id: 1, name: 'שפירא גדעון', avatar: 'שג', title: 'מנהל הפצה', status: 'חדש', lastActivity: '14:01 28/05/2025', source: 'AllJobs', matchScore: 92, phone: '054-1234567' },
  { id: 2, name: 'כהן מאיה', avatar: 'כמ', title: 'סגן מנהל לוגיסטיקה', status: 'סינון טלפוני', lastActivity: '11:23 27/05/2025', source: 'LinkedIn', matchScore: 85, phone: '052-2345678' },
  { id: 3, name: 'לוי דוד', avatar: 'לד', title: 'אחראי משמרת', status: 'ראיון', lastActivity: '09:05 27/05/2025', source: 'חבר מביא חבר', matchScore: 78, phone: '053-3456789' },
  { id: 4, name: 'ישראלי יעל', avatar: 'יי', title: 'מנהלת תפעול', status: 'הצעה', lastActivity: '18:45 26/05/2025', source: 'Ethosia', matchScore: 95, phone: '050-4567890' },
  { id: 5, name: 'מזרחי אבי', avatar: 'מא', title: 'רכז הפצה', status: 'נדחה', lastActivity: '16:30 25/05/2025', source: 'GotFriends', matchScore: 45, phone: '058-5678901' },
  { id: 6, name: 'פרץ שמעון', avatar: 'פש', title: 'נהג חלוקה', status: 'חדש', lastActivity: '11:00 29/05/2025', source: 'JobMaster', matchScore: 88, phone: '055-1122334' },
  { id: 7, name: 'ביטון רחל', avatar: 'בר', title: 'מנהלת לוגיסטיקה', status: 'נדחה', lastActivity: '15:20 28/05/2025', source: 'LinkedIn', matchScore: 65, phone: '056-2233445' },
  { id: 8, name: 'אזולאי משה', avatar: 'אמ', title: 'ראש צוות מחסן', status: 'סינון טלפוני', lastActivity: '10:10 29/05/2025', source: 'AllJobs', matchScore: 91, phone: '058-3344556' },
];

export const mockExistingJob = {
    id: 10257,
    title: 'סגן.ית מנהל הפצה',
    client: 'מיכלי זהב, שיווק והפצה',
    field: 'לוגיסטיקה',
    role: 'סגן מנהל הפצה',
    priority: 'רגילה' as 'רגילה' | 'דחופה' | 'קריטית',
    clientType: 'Retail',
    city: 'מודיעין',
    region: 'מרכז',
    gender: 'זכר' as 'זכר' | 'נקבה' | 'לא משנה',
    mobility: true,
    licenseType: 'C1',
    postingCode: String(Math.floor(100000 + Math.random() * 900000)),
    validityDays: 60,
    recruitingCoordinator: 'חלי',
    accountManager: 'חלי',
    salaryMin: 10000,
    salaryMax: 11000,
    ageMin: 18,
    ageMax: 65,
    openPositions: 1,
    status: 'פתוחה' as 'פתוחה' | 'מוקפאת' | 'מאוישת' | 'טיוטה',
    associatedCandidates: mockJobCandidates.length,
    openDate: new Date().toISOString().split('T')[0],
    recruiter: 'חלי',
    location: 'מודיעין, עמק האלה 250 (אזור תעשייה ליגד)',
    jobType: ['מלאה'],
    description: `**מטרת התפקיד:**
סיוע למנהל ההפצה בניהול השוטף והיעיל של מערך ההפצה בחברה הכולל אחריות על עמידה ביעדי הפצה, תפעול, שירות, ותחזוקת צי המשאיות והנהגים תוך הקפדה על איכות השירות ללקוחות החברה ושמירה על נהלים ובטיחות.

**התפקיד כולל:**
- ניהול ותיאום פעילות יומית של נהגי ההפצה – נוכחות, זמינות, עזרה בסידורי עבודה ולוחות זמנים.
- בקרה על עמידה ביעדי הפצה, זמני יציאה וחזרה, ומעקב אחר סידורי עבודה.
- טיפול באירועים חריגים במהלך היום (תקלות, איחורים, תאונות, חסרים).
- אחריות על תחזוקת המשאיות, רישוי, טיפולים ובדיקות תקופתיות בשיתוף מנהל ההפצה.
- סיוע בהטמעת נהלים ובקרה על יישומם בשטח.
- עבודה שוטפת מול מחלקות התפעול, השירות והמכירות לשם הבטחת זרימה תקינה של ההזמנות והמשלוחים.
- מתן מענה מקצועי לנהגים וללקוחות החברה בנושאי הפצה ולוגיסטיקה.
- סיוע בהדרכה, ליווי וחניכת נהגים חדשים.
- החלפת מנהל ההפצה בעת הצורך וביצוע כלל המשימות הנדרשות בתפקיד.
- הפקת תעודות משלוח לנהגים.
- אחריות על החזרת תעודות משלוח מנהגים, אישור מילוי התעודה וסריקתם למערכת.

*עבודה במשרה מלאה ימים א-ה בשעות 8-17/9-18*
***עובד.ת חברה מהיום הראשון, תנאי רווחה ותנאים סוציאליים מעולים***`,
    requirements: [
        'ניסיון קודם בתחום ההפצה / לוגיסטיקה – חובה (עדיפות לניסיון ניהולי או פיקודי).',
        'היכרות עם תחום הקמעונאות ומערך שירות לקוחות – יתרון משמעותי.',
        'יכולת ניהול צוות, סדר וארגון, שליטה בלוחות זמנים.',
        'יחסי אנוש מצוינים, אסרטיביות ויכולת קבלת החלטות בשטח.',
        'שליטה ביישומי מחשב- חובה.',
        'רישיון C1 – יתרון.'
    ],
    internalNotes: '<רק גברים>\n<לא מגזר>',
    contacts: [],
    recruitmentSources: [],
    telephoneQuestions: [
        { id: 1, question: "מה הניסיון שלך בניהול צוות עובדים?", order: 1, disqualificationReason: 'ניסיון' },
        { id: 2, question: "האם יש לך רישיון C1 בתוקף?", order: 2, disqualificationReason: 'רישוי' },
        { id: 3, question: "מהי הזמינות שלך להתחלת עבודה?", order: 3, disqualificationReason: 'זמינות' },
    ],
    languages: [],
};