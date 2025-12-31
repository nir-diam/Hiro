
export interface PublicJob {
    id: number;
    title: string;
    company: string;
    location: string;
    type: string; // e.g. "משרה מלאה"
    date: string;
    description: string; // HTML or Markdown supported
    logo: string;
    field: string;
}

const opsManagerDesc = `
<strong>תיאור המשרה:</strong>
לחברה טכנולוגית תעשייתית מבוססת, מקבוצת תעשייה מובילה בישראל, דרוש/ה מנהל/ת תפעול מנוסה להובלת פעילות ייצור ותפעול של מוצרים טכנולוגיים מתקדמים לשוק המקומי והבינלאומי.
החברה מונה כ־50 עובדים ופועלת במתכונת של 3 משמרות.

<strong>תחומי אחריות מרכזיים:</strong>
• ניהול כולל של רצפת הייצור בסביבה טכנולוגית מתקדמת.
• אחריות לעמידה ביעדי אספקה, איכות ו־SLA ללקוחות בארץ ובחו״ל.
• עבודה שוטפת מול לקוחות, לרבות לקוחות בינלאומיים.
• ניהול תהליכי ייצור של מערכות ומוצרים טכנולוגיים מורכבים.
• אחריות על תחזוקת ציוד ומכונות ייעודיות.
• ניהול תחומי לוגיסטיקה, רכש תפעולי ומלאי.
• תכנון ובקרה תפעולית בהיעדר צוות תפ״י ייעודי.
• הובלת שיפורים תהליכיים והתייעלות תפעולית.

<strong>דרישות התפקיד:</strong>
• תואר אקדמי רלוונטי – חובה (הנדסת מכונות / הנדסת תעשייה וניהול / הנדסת אלקטרוניקה).
• ניסיון מוכח בניהול תפעול בסביבה טכנולוגית־תעשייתית.
• ניסיון בעבודה עם מוצרים טכנולוגיים מורכבים.
• ניסיון בעבודה מול לקוחות, כולל חו״ל.
• אנגלית ברמה גבוהה מאוד – חובה.
• ניסיון בניהול פעילות ייצור ב־3 משמרות.

<strong>פרופיל ניהולי מבוקש:</strong>
• ראייה מערכתית רחבה ויכולת ניהול End-to-End.
• עצמאות, אסרטיביות ויכולת קבלת החלטות.
• חוסן ניהולי ועמידה בלחצים.
• יכולת רתימה והובלת צוותים בסביבה מרובת ממשקים.
• סדר, ארגון ויכולת תיעדוף גבוהה.
• תקשורת בין־אישית גבוהה ושירותיות מול לקוחות.

<strong>פרטים נוספים:</strong>
סביבת עבודה טכנולוגית ודינמית.
משרה מלאה, פונה לשני המינים.
`;

const marketingManagerDesc = `
<strong>תיאור התפקיד:</strong>
לחברת מוצרי צריכה גדולה ומובילה דרוש/ה מנהל/ת שיווק נמרץ/ת ויצירתי/ת.
התפקיד כולל בניית אסטרטגיה שיווקית, ניהול תקציב, והובלת מהלכים שיווקיים חוצי ארגון.
הזדמנות להשתלב במותג מוביל ולהשפיע על הצמיחה העסקית.

<strong>תחומי אחריות:</strong>
• בניית תוכניות עבודה שנתיות וניהול תקציב השיווק.
• ניהול קמפיינים בדיגיטל ובמדיה המסורתית (ATL/BTL).
• השקת מוצרים חדשים וניהול חיי מדף של מוצרים קיימים.
• ניהול מחקרי שוק וניתוח מגמות צרכנים.
• עבודה מול משרדי פרסום, יח"צ וספקים חיצוניים.
• שיתוף פעולה צמוד עם מחלקת המכירות להשגת יעדים עסקיים.

<strong>דרישות:</strong>
• תואר ראשון בשיווק / מנהל עסקים / תקשורת - חובה.
• ניסיון של 3 שנים לפחות בניהול שיווק בחברת מוצרי צריכה (FMCG) - חובה.
• ניסיון בניהול דיגיטל ורשתות חברתיות.
• יכולת אנליטית גבוהה והבנה עסקית.
• יצירתיות, יוזמה ויכולת הנעת תהליכים.
• אנגלית ברמה גבוהה.
`;

const fullStackDesc = `
<strong>About the Role:</strong>
We are looking for a Senior Full Stack Developer to join our core R&D team.
You will be responsible for designing and building scalable, high-performance web applications using modern technologies.
This is a hands-on role where you will have a significant impact on the product and architecture.

<strong>Responsibilities:</strong>
• Design and develop end-to-end features using React, Node.js, and TypeScript.
• Architect scalable and maintainable codebases.
• Collaborate with Product Managers and Designers to deliver high-quality user experiences.
• Mentor junior developers and conduct code reviews.
• Optimize application performance and ensure high availability.

<strong>Requirements:</strong>
• 5+ years of experience in Full Stack development.
• Deep understanding of React.js and its core principles.
• Proficiency in Node.js and server-side frameworks (Express/NestJS).
• Experience with cloud platforms (AWS/GCP/Azure) - Advantage.
• Strong problem-solving skills and ability to work independently.
• Excellent communication skills in English and Hebrew.
`;

const salesRepDesc = `
<strong>תיאור המשרה:</strong>
לחברה מובילה בתחום הרכב דרוש/ה נציג/ת מכירות לאולם תצוגה.
התפקיד כולל קבלת קהל, ייעוץ ללקוחות, ביצוע נסיעות מבחן וסגירת עסקאות.
סביבת עבודה יוקרתית, תנאים מעולים למתאימים/ות!

<strong>מה אנחנו מציעים?</strong>
• שכר בסיס גבוה + בונוסים מתגמלים על מכירות.
• רכב צמוד לאחר תקופת הכשרה.
• אפשרויות קידום למסלולי ניהול.
• הכשרות מקצועיות על חשבון החברה.

<strong>דרישות:</strong>
• ניסיון במכירות פרונטליות - יתרון משמעותי.
• רישיון נהיגה בתוקף (מעל שנתיים) - חובה.
• הופעה ייצוגית ותודעת שירות גבוהה.
• יכולת ורבלית מצוינת וכושר שכנוע.
• נכונות לעבודה במשמרות (כולל ימי שישי).
`;

// Helper to generate IDs
let idCounter = 100;

export const publicJobsData: PublicJob[] = [
    {
        id: ++idCounter,
        title: 'מנהל/ת תפעול',
        company: 'חברה טכנולוגית תעשייתית מובילה',
        location: 'מרכז',
        type: 'משרה מלאה',
        date: 'היום',
        description: opsManagerDesc,
        field: 'תפעול',
        logo: 'https://cdn-icons-png.flaticon.com/512/3067/3067250.png'
    },
    {
        id: ++idCounter,
        title: 'מנהל/ת שיווק',
        company: 'שטראוס מים',
        location: 'פתח תקווה',
        type: 'משרה מלאה',
        date: 'אתמול',
        description: marketingManagerDesc,
        field: 'שיווק',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Strauss_Group_Logo.svg'
    },
    {
        id: ++idCounter,
        title: 'Senior Full Stack Developer',
        company: 'Wix',
        location: 'תל אביב',
        type: 'היברידי',
        date: 'לפני יומיים',
        description: fullStackDesc,
        field: 'פיתוח תוכנה',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/7/76/Wix.com_website_logo.svg'
    },
    {
        id: ++idCounter,
        title: 'נציג/ת מכירות רכב',
        company: 'כלמוביל',
        location: 'ראשון לציון',
        type: 'משמרות',
        date: 'לפני 3 ימים',
        description: salesRepDesc,
        field: 'מכירות',
        logo: 'https://upload.wikimedia.org/wikipedia/he/thumb/3/30/Colmobil_Logo.svg/1200px-Colmobil_Logo.svg.png'
    },
    // Adding more mock data to feel "heavy"
    ...Array.from({ length: 26 }).map((_, i) => ({
        id: ++idCounter,
        title: [
            'מנהל/ת פרויקטים', 'אנליסט/ית נתונים', 'מנהל/ת חשבונות', 'רכז/ת גיוס', 
            'מחסנאי/ת', 'נהג/ת חלוקה', 'מזכיר/ה רפואי/ת', 'נציג/ת שירות לקוחות'
        ][i % 8],
        company: [
            'בזק', 'אלביט מערכות', 'תנובה', 'בנק הפועלים', 'שופרסל', 
            'טבע', 'הראל ביטוח', 'סלקום'
        ][i % 8],
        location: ['תל אביב', 'חיפה', 'ירושלים', 'באר שבע', 'הרצליה', 'רחובות'][i % 6],
        type: ['משרה מלאה', 'חלקית', 'משמרות'][i % 3],
        date: `לפני ${i + 2} ימים`,
        description: `
<strong>תיאור כללי:</strong>
הזדמנות להצטרף לארגון מוביל וצומח. אנו מחפשים עובד/ת מסור/ה ומקצועי/ת לתפקיד מאתגר ומגוון.
התפקיד כולל עבודה בצוות, עמידה ביעדים, ומתן שירות איכותי ללקוחות החברה וממשקים פנימיים.

<strong>דרישות:</strong>
• ניסיון קודם בתפקיד דומה - יתרון.
• יחסי אנוש טובים ויכולת עבודה בצוות.
• שליטה ביישומי מחשב.
• נכונות לעבודה מאומצת.
• זמינות מיידית.

<strong>תנאים:</strong>
• שכר מתגמל למתאימים/ות.
• תנאים סוציאליים מלאים מהיום הראשון.
• ארוחות מסובסדות / תלושים.
• אפשרויות קידום למצטיינים.
        `,
        field: ['כללי', 'אדמיניסטרציה', 'לוגיסטיקה', 'כספים'][i % 4],
        logo: 'https://cdn-icons-png.flaticon.com/512/3616/3616470.png'
    }))
];
