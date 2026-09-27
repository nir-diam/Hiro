/**
 * Central registry of (triggerName, eventName) pairs that the runtime emits.
 * Each pair MUST exist in the `system_events` table for the corresponding
 * audit log to be written. Keeping them as constants here protects the
 * runtime against accidental Hebrew typos at call-sites.
 */

const SYSTEM_EVENTS = {
  // 1. נקלטו קורות חיים
  CV_RECEIVED: { triggerName: 'נקלטו קורות חיים', eventName: 'קליטת קו"ח' },
  CV_DUPLICATE_HASH: {
    triggerName: 'נקלטו קורות חיים',
    eventName: 'קליטת קו"ח כפולה',
  },
  CV_PARSED:   { triggerName: 'נקלטו קורות חיים', eventName: 'פרסור ניתוח ועיבוד מידע' },
  CV_TAGS:     { triggerName: 'נקלטו קורות חיים', eventName: 'הגדרת תגיות' },
  CV_SOURCE:   { triggerName: 'נקלטו קורות חיים', eventName: 'הגדרת מקור גיוס' },
  CV_FIELD:    { triggerName: 'נקלטו קורות חיים', eventName: 'הגדרת תחום משרה' },

  // 2. ניתוח משרה חכם
  JOB_AI_ANALYSIS:  { triggerName: 'ניתוח משרה חכם', eventName: 'ניתוח ועיבוד משרה' },
  JOB_FIELD_ASSIGN: { triggerName: 'ניתוח משרה חכם', eventName: 'הגדרת תחום משרה' },
  JOB_QUESTIONS:    { triggerName: 'ניתוח משרה חכם', eventName: 'יצירת שאלון סינון' },

  // 3. שינוי סטטוס מועמד
  CANDIDATE_STATUS:   { triggerName: 'שינוי סטטוס מועמד', eventName: 'סטטוס השתנה' },
  CANDIDATE_DUE_DATE: { triggerName: 'שינוי סטטוס מועמד', eventName: 'עדכון תאריך יעד' },

  // 4. שלמות נתוני מועמד (אישור תיקונים בפרופיל)
  CANDIDATE_DATA_APPROVED: { triggerName: 'שלמות נתוני מועמד', eventName: 'אישור תיקונים' },
  CANDIDATE_MISSING_DETAILS_COMPLETED: {
    triggerName: 'שלמות נתוני מועמד',
    eventName: 'השלמת פרטים חסרים',
  },

  // 9. פורטל מועמד — אישור פרופיל (matches candidate.events journal type label)
  CANDIDATE_PROFILE_APPROVED: { triggerName: 'מועמד', eventName: 'אישור הפרופיל על ידי המועמד' },
  CANDIDATE_PROFILE_LINKED: { triggerName: 'מועמד', eventName: 'קישור פרופיל' },
  CANDIDATE_PROFILE_UNLINKED: { triggerName: 'מועמד', eventName: 'ניתוק פרופיל' },
  CANDIDATE_IDENTITY_MERGED: { triggerName: 'מועמד', eventName: 'מיזוג מועמד למועמד קיים' },

  // 5. תקשורת צוות
  TEAM_FEEDBACK:    { triggerName: 'תקשורת צוות', eventName: 'משוב לאחר ראיון' },
  TEAM_INTERNAL:    { triggerName: 'תקשורת צוות', eventName: 'הודעה פנימית' },
  TEAM_USER_MSG:    { triggerName: 'תקשורת צוות', eventName: 'הודעת משתמש' },

  // 6. ניהול תיק לקוח
  CLIENT_UPDATE:    { triggerName: 'ניהול תיק לקוח', eventName: 'התקבל עדכון מהלקוח' },
  CLIENT_DOC:       { triggerName: 'ניהול תיק לקוח', eventName: 'העלאת מסמך' },
  CLIENT_NOTICE:    { triggerName: 'ניהול תיק לקוח', eventName: 'הערה חשובה (גורף)' },

  // 7. סינון וטיוב
  SCREEN_LANGS:    { triggerName: 'סינון וטיוב', eventName: 'עדכון שפות' },
  SCREEN_RECRUITER:{ triggerName: 'סינון וטיוב', eventName: 'עדכון רכזים' },

  // 8. דיוור ודיווח
  MAIL_SENT:       { triggerName: 'דיוור ודיווח', eventName: 'נשלח דיוור' },
  STAFF_EMAIL_SENT:{ triggerName: 'דיוור ודיווח', eventName: 'נשלח מייל' },
  PROPOSAL_SENT:   { triggerName: 'דיוור ודיווח', eventName: 'הצעת מחיר' },
  MAIL_STATUS_BULK:{ triggerName: 'דיוור ודיווח', eventName: 'נשלח סטטוס מועמדים' },
};

module.exports = SYSTEM_EVENTS;
