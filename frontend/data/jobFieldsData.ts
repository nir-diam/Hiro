// data/jobFieldsData.ts

export interface JobRole {
  value: string;
  synonyms: string[];
}

export interface JobFieldType {
  name: string;
  roles: JobRole[];
}

export interface JobCategory {
  name: string;
  fieldTypes: JobFieldType[];
}

export const jobFieldsData: JobCategory[] = [
    {
        name: "בנייה ותשתיות",
        fieldTypes: [
            { name: "בנייה ויזמות", roles: [{ value: "בנייה ויזמות", synonyms: [] }] },
            { name: "תשתיות תחבורה", roles: [{ value: "תשתיות תחבורה", synonyms: [] }] },
            { name: "הנדסה אזרחית", roles: [{ value: "הנדסה אזרחית", synonyms: [] }] },
            { name: "ניהול פרויקטים בבנייה", roles: [{ value: "ניהול פרויקטים בבנייה", synonyms: [] }] },
            { name: "ייצור מלט ובטון", roles: [{ value: "ייצור מלט ובטון", synonyms: [] }] },
            { name: "אדריכלות ועיצוב פנים", roles: [{ value: "אדריכלות ועיצוב פנים", synonyms: [] }] },
            { name: "בנייה ירוקה", roles: [{ value: "בנייה ירוקה", synonyms: [] }] },
            { name: "ייצור זכוכית וחלונות", roles: [{ value: "ייצור זכוכית וחלונות", synonyms: [] }] },
            { name: "תעשיית האלומיניום", roles: [{ value: "תעשיית האלומיניום", synonyms: [] }] },
            { name: "מערכות חשמל לבניינים", roles: [{ value: "מערכות חשמל לבניינים", synonyms: [] }] },
            { name: "תשתיות מים", roles: [{ value: "תשתיות מים", synonyms: [] }] },
        ],
    },
    {
        name: "תעשייה וייצור",
        fieldTypes: [
            { name: "ייצור מתכת", roles: [{ value: "ייצור מתכת", synonyms: [] }] },
            { name: "עיבוד פלסטיק", roles: [{ value: "עיבוד פלסטיק", synonyms: [] }] },
            { name: "ייצור שבבים", roles: [{ value: "ייצור שבבים", synonyms: [] }] },
            { name: "טכנולוגיית הדפסה תלת-ממדית", roles: [{ value: "טכנולוגיית הדפסה תלת-ממדית", synonyms: [] }] },
            { name: "תעשיית הטקסטיל", roles: [{ value: "תעשיית הטקסטיל", synonyms: [] }] },
            { name: "ייצור כלי עבודה", roles: [{ value: "ייצור כלי עבודה", synonyms: [] }] },
            { name: "תעשיית האופנה", roles: [{ value: "תעשיית האופנה", synonyms: [] }] },
            { name: "ייצור נייר ואריזות", roles: [{ value: "ייצור נייר ואריזות", synonyms: [] }] },
            { name: "תעשיית הרובוטיקה", roles: [{ value: "תעשיית הרובוטיקה", synonyms: [] }] },
            { name: "תעשיית הבריאות והפארמה", roles: [{ value: "תעשיית הבריאות והפארמה", synonyms: [] }] },
            { name: "ייצור חשמל ותשתיות", roles: [{ value: "ייצור חשמל ותשתיות", synonyms: [] }] },
            { name: "תעשייה ביטחונית", roles: [{ value: "תעשייה ביטחונית", synonyms: [] }] },
            { name: "ייצור מכשור ומוצרים משלימים", roles: [{ value: "ייצור מכשור ומוצרים משלימים", synonyms: [] }] },
            { name: "ייצור מזון ומשקאות", roles: [{ value: "ייצור מזון ומשקאות", synonyms: [] }] },
            { name: "ייצור כימיקלים וצבעים", roles: [{ value: "ייצור כימיקלים וצבעים", synonyms: [] }] },
            { name: "תעשיית הריהוט", roles: [{ value: "תעשיית הריהוט", synonyms: [] }] },
            { name: "אלקטרוניקה", roles: [{ value: "אלקטרוניקה", synonyms: [] }] },
            { name: "דפוס", roles: [{ value: "דפוס", synonyms: [] }] },
            { name: "אופטיקה", roles: [{ value: "אופטיקה", synonyms: [] }] },
            { name: "מטבחים", roles: [{ value: "מטבחים", synonyms: [] }] },
            { name: "שיש ואבן", roles: [{ value: "שיש ואבן", synonyms: [] }] },
            { name: "אלומיניום", roles: [{ value: "אלומיניום", synonyms: [] }] },
            { name: "זכוכית וחלונות", roles: [{ value: "זכוכית וחלונות", synonyms: [] }] },
            { name: "מיזוג אוויר", roles: [{ value: "מיזוג אוויר", synonyms: [] }] },
        ],
    },
    {
        name: "תחבורה ולוגיסטיקה",
        fieldTypes: [
            { name: "תעופה", roles: [{ value: "תעופה", synonyms: [] }] },
            { name: "ספנות", roles: [{ value: "ספנות", synonyms: [] }] },
            { name: "רכבות", roles: [{ value: "רכבות", synonyms: [] }] },
            { name: "תחבורה ציבורית", roles: [{ value: "תחבורה ציבורית", synonyms: [] }] },
            { name: "לוגיסטיקה ושינוע", roles: [{ value: "לוגיסטיקה ושינוע", synonyms: [] }] },
            { name: "מחסנים וניהול מלאי", roles: [{ value: "מחסנים וניהול מלאי", synonyms: [] }] },
            { name: "חברות שילוח", roles: [{ value: "חברות שילוח", synonyms: [] }] },
            { name: "תחבורה חכמה", roles: [{ value: "תחבורה חכמה", synonyms: [] }] },
            { name: "שירותי מוניות", roles: [{ value: "שירותי מוניות", synonyms: [] }] },
            { name: "הפצה ושרשרת אספקה", roles: [{ value: "הפצה ושרשרת אספקה", synonyms: [] }] },
        ],
    },
];
