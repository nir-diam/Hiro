const RecruitmentStatus = require('../models/RecruitmentStatus');
const { canonicalizeStatusGroup } = require('../utils/recruitmentStatusGroups');

const FALLBACK = {
  rejectColor: '#b91c1c',
  processColor: '#ca8a04',
  acceptColor: '#15803d',
  buckets: { reject: [], process: [], accept: [] },
};

/**
 * Map recruitment_statuses.statusGroup (Hebrew or canonical) to UI buckets used for screening checklist colors.
 * נדחה → reject tone, התקבל → accept tone, בתהליך / pipeline → process tone.
 */
function bucketForPresentation(sgRaw) {
  const sg = String(sgRaw ?? '').trim();
  if (!sg) return 'process';
  if (/נדחה|דחייה|סירוב|נפסל/i.test(sg)) return 'reject';
  if (/התקבל|מאויש|קליטה/i.test(sg)) return 'accept';
  if (/בתהליך|תהליך|סינון|טלפוני/i.test(sg)) return 'process';

  const canon = canonicalizeStatusGroup(sgRaw);
  if (canon === 'exit') return 'reject';
  if (canon === 'hired') return 'accept';
  if (canon === 'advanced' || canon === 'screening' || canon === 'applied') return 'process';
  return 'process';
}

/**
 * Representative textColor per bucket (first active row by sortOrder).
 */
async function getScreeningPresentationForClient(clientId) {
  if (!clientId) return { ...FALLBACK };

  const rows = await RecruitmentStatus.findAll({
    where: { clientId, isActive: true },
    order: [['sortIndex', 'ASC']],
    attributes: ['statusGroup', 'name', 'textColor', 'sortIndex'],
  });

  const buckets = { reject: [], process: [], accept: [] };
  for (const r of rows) {
    const b = bucketForPresentation(r.statusGroup);
    buckets[b].push({
      name: r.name,
      textColor: r.textColor,
      statusGroup: r.statusGroup,
    });
  }

  const pickColor = (arr, fb) => {
    const hit = arr.find((x) => x.textColor && String(x.textColor).trim());
    return hit ? String(hit.textColor).trim() : fb;
  };

  return {
    rejectColor: pickColor(buckets.reject, FALLBACK.rejectColor),
    processColor: pickColor(buckets.process, FALLBACK.processColor),
    acceptColor: pickColor(buckets.accept, FALLBACK.acceptColor),
    buckets,
  };
}

module.exports = {
  getScreeningPresentationForClient,
  bucketForPresentation,
  FALLBACK,
};
