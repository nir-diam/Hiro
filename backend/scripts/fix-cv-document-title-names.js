/**
 * Strip "קורות חיים" / CV / Resume from candidate names already in the database.
 *
 *   node scripts/fix-cv-document-title-names.js           # dry run
 *   node scripts/fix-cv-document-title-names.js --apply   # write
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Op } = require('sequelize');
const { sequelize } = require('../src/config/db');
const Candidate = require('../src/models/Candidate');
const {
  sanitizePersonNameFields,
  nameLooksLikeCvDocumentTitle,
} = require('../src/utils/personName');
const { CV_REVIEW_TAG, withCvReviewTags } = require('../src/services/cvParseQuality');

const APPLY = process.argv.includes('--apply');

function needsCleanup(row) {
  const blob = [row.fullName, row.firstName, row.lastName].filter(Boolean).join(' ');
  if (nameLooksLikeCvDocumentTitle(blob)) return true;
  if (nameLooksLikeCvDocumentTitle(row.fullName)) return true;
  const sanitized = sanitizePersonNameFields(row);
  return sanitized.cleared || (sanitized.fullName && sanitized.fullName !== String(row.fullName || '').trim());
}

async function main() {
  await sequelize.authenticate();
  const rows = await Candidate.findAll({
    where: {
      isDeleted: false,
      [Op.or]: [
        { fullName: { [Op.iLike]: '%קורות%' } },
        { fullName: { [Op.iLike]: '%קו"ח%' } },
        { fullName: { [Op.iLike]: '%קו״ח%' } },
        { fullName: { [Op.iLike]: '%resume%' } },
        { firstName: { [Op.iLike]: 'קורות' } },
        { lastName: { [Op.iLike]: 'קורות' } },
      ],
    },
    attributes: ['id', 'fullName', 'firstName', 'lastName', 'internalTags', 'createdAt'],
  });

  const changes = [];
  for (const row of rows) {
    if (!needsCleanup(row)) continue;
    const sanitized = sanitizePersonNameFields(row);
    const nextTags = sanitized.cleared
      ? withCvReviewTags(row.internalTags, { partial: true })
      : row.internalTags;
    changes.push({
      id: row.id,
      from: row.fullName,
      to: sanitized.fullName,
      cleared: sanitized.cleared,
      review: sanitized.cleared && !(row.internalTags || []).includes(CV_REVIEW_TAG),
      internalTags: nextTags,
      firstName: sanitized.firstName || null,
      lastName: sanitized.lastName || null,
    });
  }

  console.log(`[cv-name-fix] matched ${rows.length} rows, ${changes.length} need a name change. apply=${APPLY}`);
  for (const change of changes.slice(0, 30)) {
    console.log(`  ${change.id}  "${change.from}" -> "${change.to || ''}"${change.cleared ? ' (cleared)' : ''}`);
  }
  if (changes.length > 30) console.log(`  … ${changes.length - 30} more`);

  if (APPLY) {
    for (const change of changes) {
      await Candidate.update(
        {
          fullName: change.to || '',
          firstName: change.firstName,
          lastName: change.lastName,
          ...(change.cleared ? { internalTags: change.internalTags } : {}),
        },
        { where: { id: change.id } },
      );
    }
    console.log(`[cv-name-fix] updated ${changes.length} candidates`);
  }
  await sequelize.close();
}

main().catch((err) => {
  console.error('[cv-name-fix] failed', err?.message || err);
  process.exit(1);
});
