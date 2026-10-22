const emailLegacyJobLinkBackfillService = require('../services/emailLegacyJobLinkBackfillService');

async function backfillEmailLegacyJobsSinceOct8(req, res) {
  try {
    console.log('[script] GET /backfill-email-legacy-jobs — start');
    const results = await emailLegacyJobLinkBackfillService.runBatch({ req });
    console.log('[script] GET /backfill-email-legacy-jobs — done', { count: results.length });
    return res.json({
      ok: true,
      mode: 'since_oct_8',
      since: emailLegacyJobLinkBackfillService.DEFAULT_SINCE_YMD,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('[script] GET /backfill-email-legacy-jobs — failed', err?.message || err);
    return res.status(500).json({ ok: false, message: err?.message || String(err) });
  }
}

async function backfillEmailLegacyJobsTestCandidate(req, res) {
  try {
    const testId = emailLegacyJobLinkBackfillService.TEST_CANDIDATE_ID;
    console.log('[script] GET /backfill-email-legacy-jobs/test — start', { candidateId: testId });
    const results = await emailLegacyJobLinkBackfillService.runTestCandidate(req);
    console.log('[script] GET /backfill-email-legacy-jobs/test — done', { count: results.length });
    return res.json({
      ok: true,
      mode: 'test_candidate',
      candidateId: testId,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('[script] GET /backfill-email-legacy-jobs/test — failed', err?.message || err);
    return res.status(500).json({ ok: false, message: err?.message || String(err) });
  }
}

module.exports = {
  backfillEmailLegacyJobsSinceOct8,
  backfillEmailLegacyJobsTestCandidate,
};
