/**
 * Notify candidate about pending staff profile edits (email + WhatsApp stub + journal).
 */
const { v4: uuidv4 } = require('uuid');
const Candidate = require('../models/Candidate');
const emailService = require('./emailService');
const redis = require('./redisService');
const systemEventEmitter = require('../utils/systemEventEmitter');
const SYSTEM_EVENTS = require('../utils/systemEventCatalog');

const cacheDel = async (id) => {
  const cid = String(id || '').trim();
  if (!cid) return;
  try {
    await redis.del(`candidate:${cid}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[staffProposalNotify] cache del failed', cid, err?.message || err);
  }
};

const FIELD_LABELS_HE = {
  firstName: 'שם פרטי',
  lastName: 'שם משפחה',
  fullName: 'שם מלא',
  phone: 'טלפון',
  email: 'אימייל',
  idNumber: 'תעודת זהות',
  address: 'עיר / כתובת',
  location: 'מיקום',
  gender: 'מגדר',
  maritalStatus: 'מצב משפחתי',
  birthYear: 'שנת לידה',
  birthMonth: 'חודש לידה',
  birthDay: 'יום לידה',
  age: 'גיל',
  title: 'כותרת',
  professionalSummary: 'תקציר מקצועי',
  keyFacts: 'עובדות מפתח',
  workExperience: 'ניסיון תעסוקתי',
  education: 'השכלה',
  militaryService: 'שירות צבאי',
  languages: 'שפות',
  skills: 'כישורים',
  softSkills: 'כישורים רכים',
  techSkills: 'כישורים טכניים',
  desiredRoles: 'תפקידים מבוקשים',
  salaryMin: 'שכר מינימום',
  salaryMax: 'שכר מקסימום',
  drivingLicense: 'רישיון נהיגה',
  drivingLicenses: 'רישיונות נהיגה',
  mobility: 'ניידות',
  employmentType: 'סוג העסקה',
  employmentTypes: 'סוג העסקה',
  jobScope: 'היקף משרה',
  jobScopes: 'היקף משרה',
  preferredWorkModels: 'מודל עבודה',
  preferredWorkingHours: 'שעות מועדפות',
  availability: 'זמינות',
  physicalWork: 'עבודה פיזית',
  profilePicture: 'תמונת פרופיל',
};

const FIELD_ALIAS_TO_CANONICAL = {
  jobScope: 'jobScopes',
  employmentType: 'employmentTypes',
  drivingLicense: 'drivingLicenses',
};

const visibleProposalFieldKeys = (fields) => {
  const keys = Object.keys(fields || {});
  const keySet = new Set(keys);
  return keys.filter((key) => {
    const canon = FIELD_ALIAS_TO_CANONICAL[key];
    return !(canon && keySet.has(canon));
  });
};

const summarizeFieldValue = (value) => {
  if (Array.isArray(value)) {
    const parts = value.map((item) => String(item ?? '').trim()).filter(Boolean);
    return parts.length ? parts.join(', ') : '—';
  }
  if (value == null || value === '') return '—';
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 120 ? `${t.slice(0, 117)}…` : t;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const s = JSON.stringify(value);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return '—';
  }
};

const appendCandidateJournal = async (candidateId, { type, description, creator }) => {
  const row = await Candidate.findByPk(candidateId);
  if (!row) return;
  const events = Array.isArray(row.events) ? [...row.events] : [];
  events.unshift({
    id: uuidv4(),
    type,
    description,
    creator: creator || 'מערכת',
    date: new Date().toISOString(),
  });
  await row.update({ events: events.slice(0, 200) });
  await cacheDel(String(candidateId));
};

/**
 * @param {object} opts
 * @param {string} opts.candidateId
 * @param {object} opts.proposal
 * @param {string} [opts.approveUrl]
 * @param {object} [opts.req]
 */
async function notifyCandidateOfStaffProposal({
  candidateId,
  proposal,
  approveUrl,
  req = null,
} = {}) {
  const cid = String(candidateId || '').trim();
  if (!cid || !proposal) return { emailed: false, whatsappStub: false };

  const candidate = await Candidate.findByPk(cid);
  if (!candidate || candidate.isDeleted) {
    return { emailed: false, whatsappStub: false };
  }

  const fieldKeys = visibleProposalFieldKeys(proposal.fields);
  const fieldListHe = fieldKeys
    .map((k) => FIELD_LABELS_HE[k] || k)
    .slice(0, 12)
    .join(', ');
  const name = String(candidate.fullName || 'מועמד').trim() || 'מועמד';
  const link =
    approveUrl ||
    `${String(process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/$/, '')}/candidate-portal/approve-profile-edits?cid=${encodeURIComponent(cid)}&token=${encodeURIComponent(proposal.accessToken || '')}`;

  await appendCandidateJournal(cid, {
    type: 'בקשת אישור עדכון פרופיל',
    description: `נשלחה למועמד בקשה לאשר עדכוני פרופיל (${fieldKeys.length} שדות): ${fieldListHe}.`,
    creator: proposal.proposedBy || 'רכז/ת',
  });

  try {
    await systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.CANDIDATE_STAFF_PROFILE_PROPOSAL,
      entityType: 'Candidate',
      entityId: cid,
      entityName: name,
      params: {
        name,
        fields: fieldKeys.length,
        proposalId: proposal.id,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[staffProposalNotify] system event failed', err?.message || err);
  }

  let emailed = false;
  const to = String(candidate.email || '').trim();
  if (to && to.includes('@')) {
    const lines = fieldKeys
      .slice(0, 20)
      .map((k) => {
        const label = FIELD_LABELS_HE[k] || k;
        const entry = proposal.fields[k];
        return `• ${label}: ${summarizeFieldValue(entry?.from)} → ${summarizeFieldValue(entry?.to)}`;
      })
      .join('\n');
    try {
      await emailService.sendEmail({
        to,
        subject: 'בקשה לאישור עדכון בפרופיל שלך',
        text: `שלום ${name},\n\nהצוות ביקש לעדכן פרטים בפרופיל שלך.\n\n${lines}\n\nלאישור או דחייה לפי שדה:\n${link}\n\nהקישור בתוקף עד ${proposal.expiresAt || 'שבועיים'}.`,
        html: `<p>שלום ${name},</p><p>הצוות ביקש לעדכן פרטים בפרופיל שלך.</p><pre style="white-space:pre-wrap;font-family:inherit">${lines.replace(/</g, '&lt;')}</pre><p><a href="${link}">לאישור או דחייה לפי שדה</a></p>`,
      });
      emailed = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[staffProposalNotify] email failed', cid, err?.message || err);
    }
  }

  const phone = String(candidate.phone || '').trim();
  const whatsappStub = Boolean(phone);
  if (whatsappStub) {
    // eslint-disable-next-line no-console
    console.log('[staffProposalNotify] WhatsApp stub', {
      candidateId: cid,
      phone,
      approveUrl: link,
      fields: fieldKeys.length,
    });
    await appendCandidateJournal(cid, {
      type: 'התראת WhatsApp (טיוטה)',
      description: `סומנה שליחת WhatsApp לאישור עדכון פרופיל (${phone}). שליחה אוטומטית תחובר בהמשך.`,
      creator: 'מערכת',
    });
  }

  return { emailed, whatsappStub, approveUrl: link };
}

module.exports = {
  FIELD_LABELS_HE,
  notifyCandidateOfStaffProposal,
  summarizeFieldValue,
};
