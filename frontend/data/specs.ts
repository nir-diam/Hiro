
export interface PageSpec {
    title: string;
    description: string;
    sections: {
        title: string;
        content: string[]; // Lines of text/bullet points
        codeSnippet?: string; // Optional JSON/TS interface
    }[];
}

export const specs: Record<string, PageSpec> = {
    '/communications': {
        title: 'Communication Center (מרכז תקשורת)',
        description: 'מודול מרכזי לניהול לוג תקשורת. בשלב זה המערכת מתפקדת כ-Log וממשק יזום (Initiator), ללא אינטגרציות דו-כיווניות מלאות (כגון WhatsApp Business API).',
        sections: [
            {
                title: '1. UI & Design Source',
                content: [
                    '**Code is Master:** העיצוב וההתנהגות הויזואלית נקבעים אך ורק על פי קוד ה-React הקיים (Tailwind classes).',
                    'אין להסתמך על קבצי Figma חיצוניים.',
                    'כל שינוי ויזואלי דורש עדכון בקוד הקומפוננטה הספציפית.'
                ]
            },
            {
                title: '2. Data Model (Entity: MessageLog)',
                content: [
                    'טבלת הודעות מאוחדת (Unified Log).',
                    'שדות חובה: ID, Timestamp, Direction (In/Out), Channel, RecipientID, RecipientType, Status.',
                    'שדות אופציונליים: JobID (הקשר למשרה), Content (טקסט), ErrorMessage.',
                    '**הערה:** בשלב זה אין שמירת תוכן מלאה של שיחות WhatsApp, אלא רק תיעוד של "יציאה לשיחה".'
                ],
                codeSnippet: `
interface MessageLog {
  id: string;
  direction: 'inbound' | 'outbound';
  channel: 'whatsapp' | 'sms' | 'email';
  recipient_name: string;
  recipient_phone?: string;
  recipient_email?: string;
  status: 'sent' | 'failed'; // Read/Delivered not supported yet
  timestamp: Date;
  agent_name: string; // The recruiter who performed the action
}
`
            },
            {
                title: '3. Integration Logic (הלוגיקה העסקית)',
                content: [
                    '**WhatsApp:**',
                    '   - פעולה: פתיחת לינק `https://wa.me/{phone}?text={content}` בטאב חדש.',
                    '   - סטטוס: ברגע הלחיצה, המערכת מסמנת את ההודעה כ-`Sent` בלוג.',
                    '   - מגבלה: אין אינדיקציה אמיתית אם ההודעה נשלחה בפועל או נקראה (אין Webhook).',
                    '**Email:**',
                    '   - פעולה: פתיחת `mailto:` או קריאה לשרת SMTP בסיסי לשליחה.',
                    '   - סטטוס: `Sent` לאחר שיגור מוצלח לשרת.',
                    '   - מגבלה: אין מעקב פתיחה (Open Tracking) בשלב זה.',
                    '**SMS:**',
                    '   - פעולה: שליחה דרך ספק SMS (למשל Twilio/Inforu).',
                    '   - סטטוס: `Sent` בעת קבלת OK מה-API.',
                    '   - כשלון: אם ה-API מחזיר שגיאה, הסטטוס יהיה `Failed` עם הודעת שגיאה.'
                ]
            },
            {
                title: '4. Client-Side Filtering',
                content: [
                    'הסינון מתבצע בצד הלקוח (או ב-Query ל-DB) על בסיס השדות הקיימים:',
                    'Type (סוג נמען): מועמד / לקוח / רכז.',
                    'Channel: סינון לפי ערוץ ספציפי.',
                    'Date Range: טווח תאריכים (ברירת מחדל: החודש האחרון).'
                ]
            }
        ]
    },
    '/candidates': {
        title: 'Candidate Management (ניהול מועמדים)',
        description: 'מודול לניהול "הפרופיל החי" של המועמד. המערכת מפרידה בין קובץ ה-CV המקורי לבין הנתונים ב-DB שניתנים לעריכה וטיוב.',
        sections: [
            {
                title: '1. Data Source & "Living Profile"',
                content: [
                    '**Initial State:** בעת יצירת מועמד (Upload), הנתונים נשאבים מניתוח AI של קובץ ה-CV.',
                    '**Editing:** המידע בטופס הוא "ניתק" מהקובץ המקורי. שינוי בטופס מעדכן את ה-DB בלבד ולא את הקובץ.',
                    '**Future Feature:** כפתור "Generate CV" שייצור PDF חדש על בסיס הנתונים המעודכנים בטופס.',
                    '**Field Levels:**',
                    '   - *Shared Fields:* שם, טלפון, ניסיון (משתקף למועמד ולרכז).',
                    '   - *Internal Fields:* הערכת שכר פנימית, הערות רכז, תיוג פנימי (חשוף רק לרכז).'
                ]
            },
            {
                title: '2. Audit & History (לוג שינויים)',
                content: [
                    'כל שינוי בטופס חייב להירשם ב-Event Log.',
                    'יש לתעד: מי שינה (Candidate/Recruiter/System), איזה שדה, ערך ישן, ערך חדש, ותאריך.',
                    '**Visual Indicators:**',
                    '   - אין לצבוע את כל השדה כדי למנוע עומס ויזואלי.',
                    '   - יש להוסיף Tooltip או אייקון עדין ("Edited") ליד שדות שנערכו ידנית ושונים מהמקור (AI).',
                ]
            },
            {
                title: '3. Status & Workflow',
                content: [
                    '**Dynamic Statuses:** רשימת הסטטוסים (חדש, סינון, ראיון...) אינה קבועה בקוד (Hardcoded).',
                    'המערכת צריכה למשוך את רשימת הסטטוסים והצבעים שלהם טבלת הגדרות (Settings/Configuration).',
                    'זה מאפשר לכל ארגון/לקוח להגדיר Pipeline מותאם אישית.'
                ]
            },
            {
                title: '4. Deletion Policy',
                content: [
                    '**Soft Delete (Archive):** ברירת המחדל למחיקה.',
                    'המועמד מסומן כ-`is_archived = true` ומוסתר מהרשימות הרגילות, אך הנתונים נשמרים למטרות היסטוריה ומניעת כפילויות.',
                    '**Hard Delete:** מחיקה מלאה אפשרית רק דרך ממשק אדמין או ע"י DPO (קצין הגנת פרטיות) לצורך עמידה ב-GDPR.',
                ]
            },
            {
                title: '5. Data Structure Example',
                content: [],
                codeSnippet: `
interface CandidateProfile {
  id: string;
  source_file_url: string; // The original PDF
  
  // Editable Data Fields
  personal_details: {
    full_name: string;
    phone: string;
    email: string;
    // ...
  };
  
  // Internal Data (Recruiter only)
  internal_data: {
    salary_estimation: number;
    internal_tags: string[];
    quality_score: number;
  };
  
  // Metadata
  created_by: 'ai_parser' | 'manual';
  last_updated_by: 'candidate' | 'recruiter_id' | 'system';
  is_archived: boolean;
}
`
            }
        ]
    },
    '/jobs': {
        title: 'Jobs List (רשימת משרות)',
        description: 'תצוגת הטבלה הראשית לניהול משרות. מרכזת מדדים, סטטוסים ופעולות מהירות.',
        sections: [
            {
                title: '1. Personal Rating (דירוג אישי)',
                content: [
                    '**Per Recruiter Logic:** דירוג הכוכבים (1-5) הוא **אישי** לכל משתמש.',
                    'כשרכזת מסמנת משרה ב-5 כוכבים, זה נשמר כרשומה בטבלת `user_job_ratings` ולא בטבלת `jobs`.',
                    '**Purpose:** מאפשר לכל רכזת לתעדף לעצמה את המשרות שהיא עובדת עליהן, מבלי להשפיע על שאר הצוות.'
                ]
            },
            {
                title: '2. Interactive Quick Actions',
                content: [
                    '**Status Button:** לחיצה על הסטטוס (פתוחה/מוקפאת) פותחת **Modal** לעדכון סטטוס + הוספת הערת יומן (Log).',
                    '**Priority Button:** לחיצה על הדחיפות (רגילה/דחופה) פותחת **Popover/Modal** לשינוי מהיר.',
                    '**Visual:** אלמנטים אלו חייבים להיראות לחיצים (Cursor Pointer, Hover Effect) כדי לעודד עבודה מהירה מהטבלה.'
                ]
            },
            {
                title: '3. Job Health (דופק משרה)',
                content: [
                    'אינדיקטור ויזואלי (Color Dot) המחושב בזמן אמת לכל שורה.',
                    'מבוסס על פרופיל הגדרות (SLA) כגון: "זמן ללא מועמד חדש" או "ימים ללא התקדמות בתהליך".'
                ]
            }
        ]
    },
    '/jobs/:id': {
        title: 'Internal Job Editor (עריכת משרה - פנימי)',
        description: 'המסך הראשי לניהול פרטי המשרה הפנימיים. מיועד לצוות הגיוס בלבד.',
        sections: [
            {
                title: '1. Internal vs. External Data',
                content: [
                    '**Strict Separation:** מסך זה מכיל אך ורק שדות פנימיים ורגישים.',
                    '   - *Internal:* שם הלקוח האמיתי, איש קשר, תקציב שכר, הערות צוות.',
                    '   - *External:* (מנוהל במסך נפרד "פרסום") תיאור שיווקי, דרישות לפרסום.',
                ]
            },
            {
                title: '2. Lifecycle Logic',
                content: [
                    '**Freeze/Close:** סגירת משרה לא דוחה מועמדים אוטומטית (כדי לאפשר פתיחה מחדש ללא איבוד דאטה).',
                    '**Bulk Action:** המערכת תציע כפתור יזום "נקה מועמדים" בעת סגירה, אך לא תבצע זאת ללא אישור.'
                ]
            }
        ]
    },
    '/jobs/:id/publish': {
        title: 'Job Publishing Wizard (פרסום משרה - חיצוני)',
        description: 'מסך ייעודי להכנת המשרה לפרסום. כאן הופכים את הנתונים ל"פומביים".',
        sections: [
            {
                title: '1. Marketing Content',
                content: [
                    'עריכת כותרת ותיאור שיווקיים (נפרד מהתיאור הפנימי).',
                    'הגדרת שאלות סינון (Screening Questions).',
                    'יצירת לינקים יחודיים למקורות הגיוס (Tracking Links).'
                ]
            }
        ]
    },
    '/jobs/new': {
        title: 'New Job Creation (פתיחת משרה)',
        description: 'אשף יצירת משרה הממוקד במינימום קליקים ומקסימום אוטומציה.',
        sections: [
            {
                title: '1. AI-First Approach',
                content: [
                    '**Paste & Parse:** כפתור בולט לניתוח טקסט משרה (Word/PDF/Text) בראש הטופס.',
                    'ה-AI ממלא אוטומטית: כותרת, תיאור, דרישות, שפות, ושאלות סינון.',
                    '**Smart Context:** בעת בחירת לקוח, המערכת מושכת אוטומטית את מנהל התיק ומיקום הלקוח.'
                ]
            },
            {
                title: '2. Health Profile (פרופיל בריאות)',
                content: [
                    '**Mandatory Selection:** חובה לבחור פרופיל בריאות (High Volume, Standard, Executive) בעת היצירה.',
                    'זה קובע את חוקי ה-SLA שיופעלו על המשרה בדשבורד.'
                ]
            },
            {
                title: '3. Layout & Navigation',
                content: [
                    '**Scroll Spy Navigation:** סרגל ניווט דביק (Sticky) שמאפשר קפיצה מהירה בין מקטעים (כרטיסים).',
                    '**Card Design:** כל סקשן הוא "כרטיס" נפרד (מידע כללי, דרישות, תנאים) כדי למנוע עומס ויזואלי.',
                ]
            }
        ]
    }
};
