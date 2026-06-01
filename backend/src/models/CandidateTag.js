/**
 * @deprecated Use models/SystemTag.js — table is `system_tags`.
 * Kept so legacy imports resolve to the correct table after DB rename.
 *
 * Each row's `is_active` mirrors the linked Tag catalog status:
 * true when Tag.status === 'active', false for draft/pending/deprecated/archived.
 * Updated via candidateTagService.syncSystemTagsActiveForCatalogTag on tag status change.
 */
module.exports = require('./SystemTag');
