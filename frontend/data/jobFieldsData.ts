
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
    // 1. אדמיניסטרציה ומזכירות
    {
        name: "אדמיניסטרציה ומזכירות",
        fieldTypes: [
            { 
                name: "ניהול משרד ובכירים", 
                roles: [
                    { value: "מנהל/ת משרד", synonyms: ["אחראי/ת משרד", "Office Manager"] },
                    { value: "עוזר/ת אישי/ת (PA)", synonyms: ["Personal Assistant", "עוזרת מנכ\"ל"] },
                    { value: "מנהל/ת אדמיניסטרטיבי/ת", synonyms: ["Admin Manager"] },
                    { value: "מנהל/ת לשכה", synonyms: [] }
                ] 
            },
            { 
                name: "מזכירות ושירותי קבלה", 
                roles: [
                    { value: "מזכיר/ה", synonyms: ["Secretary"] },
                    { value: "פקיד/ת קבלה", synonyms: ["Receptionist", "מארחת"] },
                    { value: "מתאם/ת פגישות", synonyms: [] },
                    { value: "מזכיר/ת חברה", synonyms: [] },
                    { value: "מזכיר/ה משפטי/ת", synonyms: [] }
                ] 
            },
            { 
                name: "תפעול ובק-אופיס", 
                roles: [
                    { value: "פקיד/ת בק אופיס", synonyms: ["Back Office", "פקיד תפעול"] },
                    { value: "רכז/ת תפעול", synonyms: ["Operations Coordinator"] },
                    { value: "קלדן/ית", synonyms: ["Data Entry"] },
                    { value: "ארכיבאי/ת", synonyms: [] }
                ] 
            }
        ]
    },

    // 2. אבטחה ושמירה
    {
        name: "אבטחה ושמירה",
        fieldTypes: [
            { 
                name: "אבטחה אזרחית", 
                roles: [
                    { value: "מאבטח/ת", synonyms: ["שומר/ת", "סייר/ת"] },
                    { value: "בודק/ת ביטחוני/ת", synonyms: [] },
                    { value: "סדרן/ית", synonyms: [] },
                    { value: "שומר/ת לובי", synonyms: [] }
                ] 
            },
            { 
                name: "ניהול ופיקוח ביטחוני", 
                roles: [
                    { value: "קצין/ת ביטחון (קב\"ט)", synonyms: ["מנהל ביטחון", "קבט ראשי"] },
                    { value: "מנהל/ת יחידת אבטחה", synonyms: [] },
                    { value: "מוקדן/ית ביטחון", synonyms: [] }
                ] 
            },
            { 
                name: "חקירות ומודיעין", 
                roles: [
                    { value: "חוקר/ת פרטי/ת", synonyms: [] },
                    { value: "עובד/ת מודיעין", synonyms: [] }
                ] 
            }
        ]
    },

    // 3. הנדסה
    {
        name: "הנדסה",
        fieldTypes: [
            { 
                name: "הנדסה אזרחית ובניין", 
                roles: [
                    { value: "מהנדס/ת בניין", synonyms: ["Civil Engineer"] },
                    { value: "קונסטרוקטור/ית", synonyms: [] },
                    { value: "הנדסאי/ת בניין", synonyms: [] },
                    { value: "מנהל/ת פרויקטים בבנייה", synonyms: [] }
                ] 
            },
            { 
                name: "חשמל ואלקטרוניקה", 
                roles: [
                    { value: "מהנדס/ת חשמל", synonyms: ["Electrical Engineer"] },
                    { value: "מהנדס/ת אלקטרוניקה", synonyms: [] },
                    { value: "הנדסאי/ת חשמל", synonyms: [] },
                    { value: "מתכנן/ת חשמל", synonyms: [] }
                ] 
            },
            { 
                name: "מכונות ותעשייה", 
                roles: [
                    { value: "מהנדס/ת מכונות", synonyms: ["Mechanical Engineer"] },
                    { value: "מהנדס/ת תעשייה וניהול", synonyms: ["Industrial Engineer", "מהנדס או\"ש"] },
                    { value: "שרטט/ת מכונות", synonyms: [] }
                ] 
            }
        ]
    },

    // 4. תוכנה ופיתוח
    {
        name: "תוכנה ופיתוח",
        fieldTypes: [
            { 
                name: "פיתוח Web", 
                roles: [
                    { value: "Full Stack Developer", synonyms: ["מפתח פול סטאק"] },
                    { value: "Frontend Developer", synonyms: ["מפתח צד לקוח", "React Developer", "Angular Developer"] },
                    { value: "Backend Developer", synonyms: ["מפתח צד שרת", "Node.js Developer", "Python Developer"] }
                ] 
            },
            { 
                name: "Mobile & Embedded", 
                roles: [
                    { value: "Mobile Developer", synonyms: ["iOS Developer", "Android Developer"] },
                    { value: "Embedded Engineer", synonyms: ["RT Embedded"] },
                    { value: "Firmware Engineer", synonyms: [] }
                ] 
            },
            { 
                name: "Data & Cloud", 
                roles: [
                    { value: "Data Scientist", synonyms: [] },
                    { value: "Data Engineer", synonyms: [] },
                    { value: "DevOps Engineer", synonyms: ["SRE", "Cloud Engineer"] },
                    { value: "Software Architect", synonyms: ["ארכיטקט תוכנה"] }
                ] 
            }
        ]
    },

    // 5. אינטרנט ודיגיטל
    {
        name: "אינטרנט ודיגיטל",
        fieldTypes: [
            { 
                name: "ניהול תוכן ורשתות", 
                roles: [
                    { value: "מנהל/ת מדיה חברתית", synonyms: ["Social Media Manager", "מנהל סושיאל"] },
                    { value: "מנהל/ת תוכן", synonyms: ["Content Manager"] },
                    { value: "עורך/ת תוכן", synonyms: ["Web Editor"] }
                ] 
            },
            { 
                name: "E-commerce", 
                roles: [
                    { value: "מנהל/ת חנות אונליין", synonyms: ["E-commerce Manager"] },
                    { value: "מנהל/ת אתר", synonyms: ["Webmaster"] }
                ] 
            }
        ]
    },

    // 6. בדיקות ואבטחת איכות (QA)
    {
        name: "בדיקות ואבטחת איכות (QA)",
        fieldTypes: [
            { 
                name: "בדיקות תוכנה", 
                roles: [
                    { value: "QA Manual", synonyms: ["בודק תוכנה ידני"] },
                    { value: "QA Automation", synonyms: ["מפתח אוטומציה", "Automation Engineer"] },
                    { value: "ראש צוות QA", synonyms: ["QA Team Lead"] }
                ] 
            },
            { 
                name: "בקרת איכות תעשייתית", 
                roles: [
                    { value: "מבקר/ת איכות (QC)", synonyms: ["Quality Control"] },
                    { value: "מנהל/ת אבטחת איכות (QA Manager)", synonyms: [] },
                    { value: "ולידטור/ית", synonyms: ["Validation Engineer"] }
                ] 
            }
        ]
    },

    // 7. סייבר ואבטחת מידע
    {
        name: "סייבר ואבטחת מידע",
        fieldTypes: [
            { 
                name: "הגנה וניטור", 
                roles: [
                    { value: "אנליסט/ית SOC", synonyms: ["SOC Analyst", "Tier 1"] },
                    { value: "מיישם/ת הגנת סייבר", synonyms: ["Cyber Security Implementer"] },
                    { value: "מנהל/ת אבטחת מידע (CISO)", synonyms: [] }
                ] 
            },
            { 
                name: "מחקר ותקיפה", 
                roles: [
                    { value: "חוקר/ת חולשות", synonyms: ["Vulnerability Researcher"] },
                    { value: "בודק/ת חדירות (PT)", synonyms: ["Penetration Tester", "Red Team"] },
                    { value: "Malware Analyst", synonyms: [] }
                ] 
            }
        ]
    },

    // 8. הוראה, חינוך והדרכה
    {
        name: "הוראה, חינוך והדרכה",
        fieldTypes: [
            { 
                name: "הוראה בתי ספר", 
                roles: [
                    { value: "מורה", synonyms: ["מחנך/ת"] },
                    { value: "מורה למקצועות ריאליים", synonyms: ["מורה למתמטיקה", "מורה לפיזיקה"] },
                    { value: "מורה לשפות", synonyms: ["מורה לאנגלית"] }
                ] 
            },
            { 
                name: "גיל רך וחינוך מיוחד", 
                roles: [
                    { value: "גנן/ת", synonyms: [] },
                    { value: "סייע/ת בגן", synonyms: [] },
                    { value: "מורה לחינוך מיוחד", synonyms: [] }
                ] 
            },
            { 
                name: "הדרכה בארגונים", 
                roles: [
                    { value: "מנהל/ת הדרכה", synonyms: ["Training Manager"] },
                    { value: "מדריך/ה / מוטמע/ת", synonyms: ["Implementer"] },
                    { value: "מפתח/ת הדרכה", synonyms: ["Instructional Designer"] }
                ] 
            }
        ]
    },

    // 9. ייצור ותעשייה
    {
        name: "ייצור ותעשייה",
        fieldTypes: [
            { 
                name: "רצפת ייצור", 
                roles: [
                    { value: "מפעיל/ת מכונה", synonyms: ["Machine Operator"] },
                    { value: "כירסום/חריטה (CNC)", synonyms: ["CNC Operator", "כוון CNC"] },
                    { value: "עובד/ת ייצור", synonyms: ["פועל ייצור"] },
                    { value: "מרכיב/ה", synonyms: ["Assembler"] }
                ] 
            },
            { 
                name: "ניהול ייצור", 
                roles: [
                    { value: "מנהל/ת מפעל", synonyms: ["Plant Manager"] },
                    { value: "מנהל/ת משמרת", synonyms: ["אחמ\"ש"] },
                    { value: "מנהל/ת תפעול", synonyms: ["Operations Manager"] }
                ] 
            }
        ]
    },

    // 10. לוגיסטיקה, מחסן והפצה
    {
        name: "לוגיסטיקה, מחסן והפצה",
        fieldTypes: [
            { 
                name: "מחסן", 
                roles: [
                    { value: "מחסנאי/ת", synonyms: ["Storekeeper"] },
                    { value: "מלגזן/ית", synonyms: ["Forklift Driver"] },
                    { value: "מלקט/ת", synonyms: ["Picker"] },
                    { value: "מנהל/ת מחסן", synonyms: ["Warehouse Manager"] }
                ] 
            },
            { 
                name: "הפצה ושינוע", 
                roles: [
                    { value: "נהג/ת חלוקה", synonyms: ["Distribution Driver"] },
                    { value: "סדרן/ית עבודה", synonyms: ["Dispatcher"] },
                    { value: "מנהל/ת הפצה", synonyms: ["Distribution Manager"] }
                ] 
            }
        ]
    },

    // 11. יבוא / יצוא / שילוח
    {
        name: "יבוא / יצוא / שילוח",
        fieldTypes: [
            { 
                name: "סחר בינלאומי", 
                roles: [
                    { value: "פקיד/ת יבוא יצוא", synonyms: ["Import/Export Clerk", "מתאם/ת יבוא יצוא"] },
                    { value: "משלח/ת בינלאומי/ת", synonyms: ["Freight Forwarder"] },
                    { value: "עמיל/ה מכס", synonyms: [] },
                    { value: "מנהל/ת יבוא יצוא", synonyms: ["Import/Export Manager"] }
                ] 
            }
        ]
    },

    // 12. רכש / תפ״י / שרשרת אספקה
    {
        name: "רכש / תפ״י / שרשרת אספקה",
        fieldTypes: [
            { 
                name: "רכש", 
                roles: [
                    { value: "קניין/ית רכש", synonyms: ["Buyer", "Purchaser"] },
                    { value: "קניין/ית רכש טכני", synonyms: [] },
                    { value: "מנהל/ת רכש", synonyms: ["Procurement Manager"] }
                ] 
            },
            { 
                name: "תכנון ושרשרת אספקה", 
                roles: [
                    { value: "פלנר/ית (תפ\"י)", synonyms: ["Planner", "PPC Manager"] },
                    { value: "מנהל/ת שרשרת אספקה", synonyms: ["Supply Chain Manager"] },
                    { value: "מתאם/ת אספקה", synonyms: [] }
                ] 
            }
        ]
    },

    // 13. משאבי אנוש וגיוס
    {
        name: "משאבי אנוש וגיוס",
        fieldTypes: [
            { 
                name: "גיוס והשמה", 
                roles: [
                    { value: "רכז/ת גיוס", synonyms: ["Recruiter", "Talent Acquisition"] },
                    { value: "סורסר/ית", synonyms: ["Sourcer"] },
                    { value: "מנהל/ת גיוס", synonyms: ["Recruitment Manager"] }
                ] 
            },
            { 
                name: "משאבי אנוש (HR)", 
                roles: [
                    { value: "מנהל/ת משאבי אנוש", synonyms: ["HR Manager"] },
                    { value: "HRBP", synonyms: ["שותף עסקי משאבי אנוש"] },
                    { value: "רכז/ת רווחה", synonyms: ["Welfare Coordinator"] },
                    { value: "חשב/ת שכר", synonyms: ["Payroll Controller"] }
                ] 
            }
        ]
    },

    // 14. מכירות
    {
        name: "מכירות",
        fieldTypes: [
            { 
                name: "מכירות שטח ופרונטלי", 
                roles: [
                    { value: "איש/אשת מכירות שטח", synonyms: ["Field Sales"] },
                    { value: "סוכן/ת מכירות", synonyms: [] },
                    { value: "נציג/ת מכירות פרונטלי", synonyms: ["דייל/ת מכירות"] },
                    { value: "מקד/מת מכירות (תעמלן)", synonyms: [] }
                ] 
            },
            { 
                name: "מכירות פנים וטלפוני", 
                roles: [
                    { value: "נציג/ת מכירות טלפוני", synonyms: ["Telesales"] },
                    { value: "מנהל/ת תיקי לקוחות", synonyms: ["Account Manager"] },
                    { value: "SDR / BDR", synonyms: ["פיתוח עסקי"] }
                ] 
            },
            { 
                name: "ניהול מכירות", 
                roles: [
                    { value: "מנהל/ת מכירות", synonyms: ["Sales Manager"] },
                    { value: "סמנכ\"ל מכירות", synonyms: ["VP Sales"] },
                    { value: "מנהל/ת צוות מכירות", synonyms: ["Team Leader Sales"] }
                ] 
            }
        ]
    },

    // 15. שיווק דיגיטל וניהול מותגים
    {
        name: "שיווק דיגיטל וניהול מותגים",
        fieldTypes: [
            { 
                name: "שיווק דיגיטלי", 
                roles: [
                    { value: "מנהל/ת קמפיינים (PPC)", synonyms: ["PPC Manager"] },
                    { value: "איש/אשת SEO", synonyms: ["SEO Specialist"] },
                    { value: "מנהל/ת שיווק דיגיטלי", synonyms: ["Digital Marketing Manager"] },
                    { value: "אנליסט/ית שיווק", synonyms: ["Marketing Analyst"] }
                ] 
            },
            { 
                name: "ניהול מותג ואסטרטגיה", 
                roles: [
                    { value: "מנהל/ת מותג", synonyms: ["Brand Manager"] },
                    { value: "מנהל/ת תקשורת שיווקית (Marcom)", synonyms: [] },
                    { value: "מנהל/ת שיווק", synonyms: ["CMO", "Marketing Manager"] }
                ] 
            }
        ]
    },

    // 16. פרסום / מדיה / תקשורת / הפקה
    {
        name: "פרסום / מדיה / תקשורת / הפקה",
        fieldTypes: [
            { 
                name: "קריאייטיב וסטודיו", 
                roles: [
                    { value: "קופירייטר/ית", synonyms: ["Copywriter"] },
                    { value: "ארט דירקטור", synonyms: ["Art Director"] },
                    { value: "גרפיקאי/ת", synonyms: ["Graphic Designer"] }
                ] 
            },
            { 
                name: "תקשורת והפקה", 
                roles: [
                    { value: "מפיק/ה", synonyms: ["Producer"] },
                    { value: "דובר/ת / יח\"צ", synonyms: ["PR Manager"] },
                    { value: "עיתונאי/ת", synonyms: [] }
                ] 
            }
        ]
    },

    // 17. שירות לקוחות
    {
        name: "שירות לקוחות",
        fieldTypes: [
            { 
                name: "מוקדי שירות", 
                roles: [
                    { value: "נציג/ת שירות לקוחות", synonyms: ["Customer Service Rep"] },
                    { value: "נציג/ת תמיכה טכנית", synonyms: ["Technical Support"] },
                    { value: "אחמ\"ש במוקד", synonyms: ["Shift Manager"] }
                ] 
            },
            { 
                name: "שירות פרונטלי", 
                roles: [
                    { value: "פקיד/ת מודיעין", synonyms: [] },
                    { value: "נציג/ת קבלה וקהל", synonyms: [] }
                ] 
            },
            { 
                name: "הצלחת לקוח (Customer Success)", 
                roles: [
                    { value: "מנהל/ת הצלחת לקוח (CSM)", synonyms: ["Customer Success Manager"] },
                    { value: "מנהל/ת חווית לקוח", synonyms: ["Customer Experience"] }
                ] 
            }
        ]
    },

    // 18. ניהול / בכירים
    {
        name: "ניהול / בכירים",
        fieldTypes: [
            { 
                name: "הנהלה בכירה", 
                roles: [
                    { value: "מנכ\"ל/ית", synonyms: ["CEO", "מנהל כללי"] },
                    { value: "סמנכ\"ל/ית (VP)", synonyms: ["Vice President"] },
                    { value: "חבר/ת דירקטוריון", synonyms: [] }
                ] 
            },
            { 
                name: "דרג ביניים", 
                roles: [
                    { value: "מנהל/ת מחלקה", synonyms: ["Department Manager"] },
                    { value: "דירקטור/ית", synonyms: ["Director"] }
                ] 
            }
        ]
    },

    // 19. משפטים
    {
        name: "משפטים",
        fieldTypes: [
            { 
                name: "עריכת דין", 
                roles: [
                    { value: "עורך/ת דין", synonyms: ["Lawyer", "Attorney"] },
                    { value: "יועץ/ת משפטי/ת", synonyms: ["Legal Counsel"] },
                    { value: "מתמחה במשפטים", synonyms: [] }
                ] 
            },
            { 
                name: "אדמיניסטרציה משפטית", 
                roles: [
                    { value: "מזכיר/ה משפטי/ת", synonyms: [] },
                    { value: "פרליגל", synonyms: ["Paralegal"] }
                ] 
            }
        ]
    },

    // 20. כספים וכלכלה
    {
        name: "כספים וכלכלה",
        fieldTypes: [
            { 
                name: "הנהלת חשבונות", 
                roles: [
                    { value: "מנהל/ת חשבונות סוג 1+2", synonyms: [] },
                    { value: "מנהל/ת חשבונות סוג 3", synonyms: ["ראשי"] },
                    { value: "חשב/ת שכר", synonyms: [] },
                    { value: "מנהל/ת חשבונות ראשי/ת", synonyms: [] }
                ] 
            },
            { 
                name: "פיננסים וכלכלה", 
                roles: [
                    { value: "כלכלן/ית", synonyms: ["Economist"] },
                    { value: "אנליסט/ית פיננסי/ת", synonyms: ["Financial Analyst"] },
                    { value: "חשב/ת (Controller)", synonyms: ["Controller"] },
                    { value: "סמנכ\"ל/ית כספים (CFO)", synonyms: [] }
                ] 
            }
        ]
    },

    // 21. מדעים / ביוטכנולוגיה / מחקר
    {
        name: "מדעים / ביוטכנולוגיה / מחקר",
        fieldTypes: [
            { 
                name: "מעבדה", 
                roles: [
                    { value: "לבורנט/ית", synonyms: ["Lab Technician"] },
                    { value: "מנהל/ת מעבדה", synonyms: ["Lab Manager"] },
                    { value: "כימאי/ת", synonyms: ["Chemist"] }
                ] 
            },
            { 
                name: "מחקר ופיתוח", 
                roles: [
                    { value: "חוקר/ת (Researcher)", synonyms: [] },
                    { value: "ביולוג/ית", synonyms: [] },
                    { value: "CRA (ניסויים קליניים)", synonyms: ["Clinical Research Associate"] }
                ] 
            }
        ]
    },

    // 22. רפואה / בריאות / סיעוד
    {
        name: "רפואה / בריאות / סיעוד",
        fieldTypes: [
            { 
                name: "צוות רפואי", 
                roles: [
                    { value: "רופא/ה", synonyms: ["Doctor"] },
                    { value: "אח/ות מוסמך/ת", synonyms: ["Nurse"] },
                    { value: "רוקח/ת", synonyms: ["Pharmacist"] }
                ] 
            },
            { 
                name: "מקצועות פרא-רפואיים", 
                roles: [
                    { value: "פיזיותרפיסט/ית", synonyms: [] },
                    { value: "מרפא/ה בעיסוק", synonyms: [] },
                    { value: "קלינאי/ת תקשורת", synonyms: [] },
                    { value: "טכנאי/ת רנטגן/אולטרסאונד", synonyms: [] }
                ] 
            }
        ]
    },

    // 23. עיצוב ואומנות
    {
        name: "עיצוב ואומנות",
        fieldTypes: [
            { 
                name: "עיצוב חזותי", 
                roles: [
                    { value: "מעצב/ת גרפי/ת", synonyms: ["Graphic Designer"] },
                    { value: "ביצועיסט/ית", synonyms: [] },
                    { value: "מעצב/ת UI/UX", synonyms: [] }
                ] 
            },
            { 
                name: "עיצוב חלל ומוצר", 
                roles: [
                    { value: "מעצב/ת פנים", synonyms: ["Interior Designer"] },
                    { value: "אדריכל/ית", synonyms: ["Architect"] },
                    { value: "מעצב/ת תעשייתי/ת", synonyms: ["Industrial Designer"] }
                ] 
            }
        ]
    },

    // 24. אופנה וטקסטיל
    {
        name: "אופנה וטקסטיל",
        fieldTypes: [
            { 
                name: "עיצוב וייצור אופנה", 
                roles: [
                    { value: "מעצב/ת אופנה", synonyms: ["Fashion Designer"] },
                    { value: "תדמיתן/ית", synonyms: [] },
                    { value: "גזרן/ית / תופר/ת", synonyms: [] }
                ] 
            },
            { 
                name: "קמעונאות אופנה", 
                roles: [
                    { value: "מנהל/ת חנות אופנה", synonyms: [] },
                    { value: "מוכר/ת בחנות בגדים", synonyms: [] },
                    { value: "סטייליסט/ית", synonyms: [] }
                ] 
            }
        ]
    },

    // 25. קמעונאות
    {
        name: "קמעונאות",
        fieldTypes: [
            { 
                name: "ניהול חנויות", 
                roles: [
                    { value: "מנהל/ת סניף", synonyms: ["Branch Manager", "מנהל חנות"] },
                    { value: "סגן/ית מנהל חנות", synonyms: [] },
                    { value: "אחמ\"ש/ית בחנות", synonyms: [] }
                ] 
            },
            { 
                name: "צוות חנות", 
                roles: [
                    { value: "מוכר/ת", synonyms: ["Sales Assistant"] },
                    { value: "קופאי/ת", synonyms: ["Cashier"] },
                    { value: "סדרן/ית סחורה", synonyms: [] }
                ] 
            },
            { 
                name: "מטה קמעונאות", 
                roles: [
                    { value: "מנהל/ת רשת", synonyms: ["Network Manager"] },
                    { value: "מנהל/ת אזור", synonyms: ["Area Manager"] },
                    { value: "קניין/ית קמעונאות", synonyms: [] }
                ] 
            }
        ]
    },

    // 26. מלונאות / מסעדנות
    {
        name: "מלונאות / מסעדנות",
        fieldTypes: [
            { 
                name: "מטבח", 
                roles: [
                    { value: "שף/ית", synonyms: ["Chef"] },
                    { value: "טבח/ית", synonyms: ["Cook"] },
                    { value: "קונדיטור/ית", synonyms: ["Pastry Chef"] },
                    { value: "שוטף/ת כלים", synonyms: [] }
                ] 
            },
            { 
                name: "שירות ומסעדה", 
                roles: [
                    { value: "מלצר/ית", synonyms: ["Waiter"] },
                    { value: "ברמן/ית", synonyms: ["Bartender"] },
                    { value: "מנהל/ת מסעדה", synonyms: ["Restaurant Manager"] },
                    { value: "מארח/ת", synonyms: ["Hostess"] }
                ] 
            },
            { 
                name: "מלונאות", 
                roles: [
                    { value: "פקיד/ת קבלה למלון", synonyms: [] },
                    { value: "חדרן/ית", synonyms: [] },
                    { value: "מנהל/ת מלון", synonyms: [] }
                ] 
            }
        ]
    },

    // 27. תיירות / תעופה / ימאות
    {
        name: "תיירות / תעופה / ימאות",
        fieldTypes: [
            { 
                name: "תיירות", 
                roles: [
                    { value: "סוכן/ת נסיעות", synonyms: ["Travel Agent"] },
                    { value: "יועץ/ת תיירות", synonyms: [] },
                    { value: "מדריך/ת טיולים", synonyms: [] }
                ] 
            },
            { 
                name: "תעופה", 
                roles: [
                    { value: "דייל/ת אוויר", synonyms: ["Flight Attendant"] },
                    { value: "דייל/ת קרקע", synonyms: [] },
                    { value: "טייס/ת", synonyms: [] },
                    { value: "קצין/ת מבצעים תעופה", synonyms: [] }
                ] 
            },
            { 
                name: "ימאות", 
                roles: [
                    { value: "ימאי/ת", synonyms: [] },
                    { value: "קצין/ת ים", synonyms: [] }
                ] 
            }
        ]
    },

    // 28. תחבורה ורכב
    {
        name: "תחבורה ורכב",
        fieldTypes: [
            { 
                name: "נהיגה", 
                roles: [
                    { value: "נהג/ת משאית", synonyms: ["Truck Driver"] },
                    { value: "נהג/ת אוטובוס", synonyms: ["Bus Driver"] },
                    { value: "נהג/ת פרטי/ת / שליחויות", synonyms: [] }
                ] 
            },
            { 
                name: "רכב ומוסכים", 
                roles: [
                    { value: "מכונאי/ת רכב", synonyms: ["Mechanic"] },
                    { value: "חשמלאי/ת רכב", synonyms: [] },
                    { value: "מנהל/ת מוסך", synonyms: [] },
                    { value: "קצין/ת רכב", synonyms: ["Fleet Manager"] }
                ] 
            }
        ]
    },

    // 29. מדעי החברה / טיפול / קהילה
    {
        name: "מדעי החברה / טיפול / קהילה",
        fieldTypes: [
            { 
                name: "טיפול ורווחה", 
                roles: [
                    { value: "עובד/ת סוציאלי/ת", synonyms: ["Social Worker"] },
                    { value: "פסיכולוג/ית", synonyms: [] },
                    { value: "מטפל/ת (רגשי/אמנות)", synonyms: [] }
                ] 
            },
            { 
                name: "חברה וקהילה", 
                roles: [
                    { value: "רכז/ת קהילה", synonyms: ["Community Manager"] },
                    { value: "מדריך/ת נוער", synonyms: [] },
                    { value: "מנהל/ת עמותה", synonyms: [] }
                ] 
            }
        ]
    },

    // 30. תחום כללי וללא ניסיון
    {
        name: "תחום כללי וללא ניסיון",
        fieldTypes: [
            { 
                name: "עבודה כללית", 
                roles: [
                    { value: "עובד/ת כללי/ת", synonyms: ["General Worker"] },
                    { value: "מנקה", synonyms: ["Cleaner"] },
                    { value: "סבל/ית", synonyms: [] }
                ] 
            },
            { 
                name: "ללא ניסיון / סטודנטים", 
                roles: [
                    { value: "משרת סטודנט/ית", synonyms: ["Student Position"] },
                    { value: "מתמחה (Intern)", synonyms: ["Internship"] },
                    { value: "עבודה מועדפת", synonyms: [] }
                ] 
            }
        ]
    }
];
