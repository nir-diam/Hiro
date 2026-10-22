const { Op } = require('sequelize');
const Candidate = require('../models/Candidate');
const SystemTag = require('../models/SystemTag');
const { SYSTEM_TAG_TYPE_CANDIDATE } = require('../models/SystemTag');
const { assessCvParseQuality } = require('./cvParseQuality');

function startOfUtcDay(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Yesterday's intake: how many CVs arrived, how many failed, at which stage, by source.
 * Stage is inferred from the saved profile (text length, experience, tags, contact, name).
 */
async function buildCvParseDailyReport(now = new Date()) {
  const end = startOfUtcDay(now);
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const rows = await Candidate.findAll({
    where: {
      isDeleted: false,
      createdAt: { [Op.gte]: start, [Op.lt]: end },
    },
    attributes: [
      'id',
      'source',
      'fullName',
      'firstName',
      'lastName',
      'email',
      'phone',
      'workExperience',
      'resumeUrl',
      'searchText',
      'internalTags',
    ],
  });
  const ids = rows.map((row) => row.id);
  const tagCounts = new Map();
  if (ids.length) {
    const tagRows = await SystemTag.findAll({
      where: { type: SYSTEM_TAG_TYPE_CANDIDATE, entity_id: ids, is_active: true },
      attributes: ['entity_id'],
    });
    for (const tag of tagRows) {
      const id = String(tag.entity_id);
      tagCounts.set(id, (tagCounts.get(id) || 0) + 1);
    }
  }

  const bySource = new Map();
  let failed = 0;
  for (const row of rows) {
    const source = String(row.source || 'unknown').trim() || 'unknown';
    const textLen = String(row.searchText || '').trim().length;
    const assessment = assessCvParseQuality({
      fullName: row.fullName,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      workExperience: row.workExperience,
      tagCount: tagCounts.get(String(row.id)) || 0,
      extractedTextLength: textLen,
      hasResumeFile: Boolean(row.resumeUrl),
    });
    if (!bySource.has(source)) {
      bySource.set(source, { source, arrived: 0, failed: 0, stages: {} });
    }
    const bucket = bySource.get(source);
    bucket.arrived += 1;
    if (assessment.partial) {
      failed += 1;
      bucket.failed += 1;
      bucket.stages[assessment.stage] = (bucket.stages[assessment.stage] || 0) + 1;
    }
  }

  return {
    from: start.toISOString(),
    to: end.toISOString(),
    arrived: rows.length,
    failed,
    partialRate: rows.length ? failed / rows.length : 0,
    bySource: Array.from(bySource.values()).sort((a, b) => b.failed - a.failed || b.arrived - a.arrived),
  };
}

function formatCvParseDailyReport(report) {
  const pct = `${Math.round((report.partialRate || 0) * 1000) / 10}%`;
  const lines = [
    `קו"ח אתמול: ${report.arrived}. נכשלו: ${report.failed} (${pct}).`,
  ];
  for (const row of report.bySource || []) {
    if (!row.failed) continue;
    const stages = Object.entries(row.stages || [])
      .map(([stage, count]) => `${stage}=${count}`)
      .join(', ');
    lines.push(`${row.source}: ${row.failed}/${row.arrived} נכשלו${stages ? ` (${stages})` : ''}`);
  }
  if (report.failed === 0) lines.push('אין כשלי פרסור.');
  return lines.join('\n');
}

module.exports = {
  buildCvParseDailyReport,
  formatCvParseDailyReport,
};
