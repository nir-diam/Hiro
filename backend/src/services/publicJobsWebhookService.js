const crypto = require('crypto');
const PublicSite = require('../models/PublicSite');
const PublicSiteWebhookDelivery = require('../models/PublicSiteWebhookDelivery');
const Client = require('../models/Client');
const { isJobListedOnSite, wasListedOnSite } = require('../utils/publicJobVisibility');

const signBody = (secret, body) =>
  crypto.createHmac('sha256', String(secret || '')).update(body).digest('hex');

/** First try is immediate. Later tries wait 10s, 1 minute, then 5 minutes. */
const WEBHOOK_RETRY_DELAYS_MS = [0, 10_000, 60_000, 300_000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const deliver = async (site, event, payload) => {
  const body = JSON.stringify({
    event,
    sentAt: new Date().toISOString(),
    ...payload,
  });
  const delivery = await PublicSiteWebhookDelivery.create({
    siteId: site.id,
    event,
    payload: JSON.parse(body),
    status: 'pending',
    attempts: 0,
  });
  const delays = WEBHOOK_RETRY_DELAYS_MS;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await sleep(delays[attempt]);
    try {
      const response = await fetch(site.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hiro-Signature': signBody(site.webhookSecret, body),
        },
        body,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await delivery.update({ status: 'delivered', attempts: attempt + 1, lastError: null });
      return;
    } catch (err) {
      await delivery.update({
        status: 'failed',
        attempts: attempt + 1,
        lastError: err?.message || String(err),
      });
    }
  }
};

const schedule = (work) => {
  setImmediate(() => {
    Promise.resolve()
      .then(work)
      .catch((err) => console.warn('[publicJobsWebhook]', err?.message || err));
  });
};

const siteContextOf = (site) => ({
  id: site.id,
  mode: site.scope === 'aggregator' ? 'aggregator' : 'tenant',
  clientId: site.clientId || null,
});

const scheduleJobEvent = (job, publication, event) => {
  schedule(async () => {
    const sites = await PublicSite.findAll();
    const agency = job?.clientId
      ? await Client.findByPk(job.clientId, { attributes: ['id', 'name', 'displayName', 'metadata'] })
      : null;
    const targets = sites.filter((site) => {
      if (!site.webhookUrl) return false;
      const args = {
        publication,
        jobClientId: job?.clientId,
        site: siteContextOf(site),
        agency: agency ? agency.get({ plain: true }) : null,
      };
      return isJobListedOnSite(args) || wasListedOnSite(args);
    });
    await Promise.all(targets.map((site) => deliver(site, event, {
      jobId: job?.id || null,
      slug: publication?.publicBoard?.publicSlug || null,
    })));
  });
};

const scheduleTaxonomyUpdated = () => {
  schedule(async () => {
    const sites = await PublicSite.findAll();
    await Promise.all(
      sites
        .filter((site) => site.webhookUrl)
        .map((site) => deliver(site, 'taxonomy.updated', {})),
    );
  });
};

const scheduleCompanyUpdated = (clientId) => {
  schedule(async () => {
    const sites = await PublicSite.findAll();
    const targets = sites.filter((site) => site.webhookUrl && (
      site.scope === 'aggregator' || String(site.clientId) === String(clientId)
    ));
    await Promise.all(targets.map((site) => deliver(site, 'company.updated', { clientId })));
  });
};

module.exports = {
  signBody,
  WEBHOOK_RETRY_DELAYS_MS,
  scheduleJobEvent,
  scheduleTaxonomyUpdated,
  scheduleCompanyUpdated,
};
