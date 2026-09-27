/**
 * Machine-readable capability catalog for the Hiro agent API.
 * Mirrors the internal Notion matrix agents use for planning.
 */
const AGENT_CAPABILITIES = [
  {
    id: 'clients.contacts.update',
    title: 'עריכת איש קשר קיים',
    domain: 'לקוחות ואנשי קשר',
    status: 'available',
    description: 'עדכון פרטים של איש קשר קיים (טלפון, תפקיד, מייל, הגדרות דיוור).',
    note: null,
    endpoint: 'PATCH /api/agent/clients/:clientId/contacts/:contactId',
    scope: 'agent:clients:write',
  },
  {
    id: 'clients.contacts.create',
    title: 'יצירת איש קשר',
    domain: 'לקוחות ואנשי קשר',
    status: 'available',
    description: 'יצירת איש קשר חדש תחת לקוח וארגון מקושר.',
    note: null,
    endpoint: 'POST /api/agent/clients/:clientId/contacts',
    scope: 'agent:clients:write',
  },
  {
    id: 'clients.contacts.delete',
    title: 'מחיקת איש קשר',
    domain: 'לקוחות ואנשי קשר',
    status: 'available',
    description: 'מחיקת איש קשר קיים.',
    note: null,
    endpoint: 'DELETE /api/agent/clients/:clientId/contacts/:contactId',
    scope: 'agent:clients:write',
  },
  {
    id: 'clients.organization_link',
    title: 'קישור ארגון ללקוח',
    domain: 'לקוחות ואנשי קשר',
    status: 'available',
    description: 'קישור ארגון קיים מהקטלוג ללקוח (כמו כפתור "קשר לארגון").',
    note: 'קריאה בודדת לכל ארגון, אין batch.',
    endpoint: 'POST /api/agent/clients/:clientId/organization-link',
    scope: 'agent:clients:write',
  },
  {
    id: 'clients.update_or_create',
    title: 'עדכון פרטי לקוח / יצירת לקוח חדש',
    domain: 'לקוחות ואנשי קשר',
    status: 'unavailable',
    description: 'אין אפשרות לערוך פרטי לקוח עצמו או לפתוח לקוח חדש — רק לקשר חברה ולנהל אנשי קשר.',
    note: null,
    endpoint: null,
    scope: null,
  },
  {
    id: 'system.candidates_jobs_users',
    title: 'גישה למועמדים, משרות ומשתמשים',
    domain: 'מערכת וכניסה',
    status: 'unavailable',
    description: 'הסוכן חסום מכל נתוני המועמדים, המשרות והמשתמשים — בכוונה (אבטחה).',
    note: null,
    endpoint: null,
    scope: null,
  },
  {
    id: 'tags.synonyms.edit_in_place',
    title: 'עריכת סינון קיים (שינוי טקסט / עדיפות)',
    domain: 'קטלוג תגיות',
    status: 'unavailable',
    description: 'אין אפשרות לערוך סינון קיים במקום.',
    note: 'עוקף: למחוק ולהוסיף מחדש (המזהה ישתנה). השתמשו ב-PATCH /api/agent/tags/:id/execute עם remove_synonyms ואז add_synonyms.',
    endpoint: 'PATCH /api/agent/tags/:id/execute',
    scope: 'agent:tags:write',
  },
];

module.exports = { AGENT_CAPABILITIES };
