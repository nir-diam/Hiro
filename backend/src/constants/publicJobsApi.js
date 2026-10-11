/** Public jobs site API (/api/public/v1) — shared constants. */

const PUBLIC_SITE_KEY_HEADER = 'x-hiro-site-key';

/** @typedef {'tenant' | 'aggregator'} PublicSiteKeyMode */

const PUBLIC_SITE_KEY_MODES = Object.freeze({
  TENANT: 'tenant',
  AGGREGATOR: 'aggregator',
});

/** Job / publication fields that must never appear in public API responses. */
const PUBLIC_JOBS_RESPONSE_BLOCKLIST = Object.freeze([
  'internalNotes',
  'listNotes',
  'listNotesHistory',
  'accountManager',
  'recruitingCoordinator',
  'uniqueEmail',
  'contacts',
  'cvForwardSettings',
  'embedding',
  'aiRawDescription',
  'rating',
  'healthProfile',
  'salaryMin',
  'salaryMax',
  'associatedCandidates',
  'waitingForScreening',
  'activeProcess',
  'events',
  'telephoneQuestions',
  'digitalQuestions',
  'languages',
  'recruitmentSources',
]);

module.exports = {
  PUBLIC_SITE_KEY_HEADER,
  PUBLIC_SITE_KEY_MODES,
  PUBLIC_JOBS_RESPONSE_BLOCKLIST,
};
