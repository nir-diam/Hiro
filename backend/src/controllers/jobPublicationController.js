const jobPublicationService = require('../services/jobPublicationService');
const authService = require('../services/authService');
const clientService = require('../services/clientService');
const Client = require('../models/Client');

/**
 * @returns {Promise<{ client: import('../models/Client') | null, scope: 'admin_all' | 'admin_client' | 'tenant' | 'tenant_empty' | 'none' }>}
 */
const resolvePublishingClient = async (req) => {
  const user = req.dbUser;
  if (!user) return { client: null, scope: 'none' };

  const isBroad = clientService.isPlatformAdmin(user);
  const queryClientId = String(req.query?.clientId || '').trim();

  if (isBroad) {
    if (queryClientId) {
      const client = await Client.findByPk(queryClientId);
      return { client: client || null, scope: 'admin_client' };
    }
    return { client: null, scope: 'admin_all' };
  }

  const effectiveClientId = await authService.resolveEffectiveClientIdForUser(user);
  if (!effectiveClientId) {
    return { client: null, scope: 'tenant_empty' };
  }
  // Tenant scope is always the linked client — never honor a different ?clientId=.
  const client = await Client.findByPk(effectiveClientId);
  return { client: client || null, scope: 'tenant' };
};

const requirePublishingClient = async (req, res) => {
  const ctx = await resolvePublishingClient(req);
  if (ctx.scope === 'tenant_empty') {
    res.status(403).json({ message: 'No client linked to this account' });
    return null;
  }
  if ((ctx.scope === 'admin_all' || ctx.scope === 'admin_client') && !ctx.client) {
    res.status(400).json({ message: 'clientId query parameter is required' });
    return null;
  }
  if (!ctx.client) {
    res.status(400).json({ message: 'Client context is required' });
    return null;
  }
  return ctx.client;
};

const getPublicLanding = async (req, res) => {
  try {
    const src = req.query.src || req.query.source || null;
    const clientHint = req.query.client || null;
    const data = await jobPublicationService.getPublicLanding(req.params.slug, src, clientHint);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load landing page' });
  }
};

/** HTML with Open Graph tags for job board link previews. Redirects humans to the SPA. */
const getBoardSharePreview = async (req, res) => {
  try {
    const clientHint = req.params.clientHint || req.query.client || null;
    const html = await jobPublicationService.renderBoardSharePreviewPage({ clientHint });
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (err) {
    res
      .status(err.status || 500)
      .set('Content-Type', 'text/plain; charset=utf-8')
      .send(err.message || 'Share preview unavailable');
  }
};

/** HTML with Open Graph tags for link previews (WhatsApp, LinkedIn, etc.). Redirects humans to the SPA. */
const getSharePreview = async (req, res) => {
  try {
    const src = req.query.src || req.query.source || null;
    const slug = req.params.slug;
    const clientHint = req.params.clientHint || req.query.client || null;
    const html = await jobPublicationService.renderSharePreviewPage({
      clientHint,
      slug,
      srcKey: src,
    });
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (err) {
    res
      .status(err.status || 500)
      .set('Content-Type', 'text/plain; charset=utf-8')
      .send(err.message || 'Share preview unavailable');
  }
};

const recordVisit = async (req, res) => {
  try {
    const src = req.body?.src || req.body?.source || req.query?.src || 'direct';
    await jobPublicationService.recordVisit(req.params.slug, src);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to record visit' });
  }
};

const submitApplication = async (req, res) => {
  try {
    const data = await jobPublicationService.submitApplication(req.params.slug, req.body || {});
    res.status(201).json(data);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Application failed' });
  }
};

const getPublication = async (req, res) => {
  try {
    const data = await jobPublicationService.getPublicationForJob(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load publication' });
  }
};

const updatePublication = async (req, res) => {
  try {
    const data = await jobPublicationService.updatePublicationForJob(req.params.id, req.body || {});
    res.json(data);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to update publication' });
  }
};

const listLinks = async (req, res) => {
  try {
    const ctx = await resolvePublishingClient(req);
    res.set('Cache-Control', 'no-store');
    if (ctx.scope === 'tenant_empty') return res.json([]);
    if (ctx.scope === 'admin_all' || (ctx.scope === 'admin_client' && !ctx.client)) {
      return res.json([]);
    }
    const rows = await jobPublicationService.listDashboardLinks(ctx.client);
    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list links' });
  }
};

const listCandidates = async (req, res) => {
  try {
    const ctx = await resolvePublishingClient(req);
    res.set('Cache-Control', 'no-store');
    if (ctx.scope === 'tenant_empty') return res.json([]);
    if (ctx.scope === 'admin_all' || (ctx.scope === 'admin_client' && !ctx.client)) {
      return res.json([]);
    }
    const rows = await jobPublicationService.listDashboardCandidates(ctx.client);
    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list candidates' });
  }
};

const getStats = async (req, res) => {
  try {
    const ctx = await resolvePublishingClient(req);
    res.set('Cache-Control', 'no-store');
    if (ctx.scope === 'tenant_empty') {
      return res.json({
        totalPublishedJobs: 0,
        jobsWithActiveLinks: 0,
        totalLinks: 0,
        totalVisits: 0,
        totalSubmissions: 0,
        conversionRate: 0,
      });
    }
    if (ctx.scope === 'admin_all' || (ctx.scope === 'admin_client' && !ctx.client)) {
      return res.json({
        totalPublishedJobs: 0,
        jobsWithActiveLinks: 0,
        totalLinks: 0,
        totalVisits: 0,
        totalSubmissions: 0,
        conversionRate: 0,
      });
    }
    const stats = await jobPublicationService.getDashboardStats(ctx.client);
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load stats' });
  }
};

const getTheme = async (req, res) => {
  try {
    const client = await requirePublishingClient(req, res);
    if (!client) return;
    const theme = await jobPublicationService.getCareerTheme(client);
    res.json(theme);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load theme' });
  }
};

const updateTheme = async (req, res) => {
  try {
    const client = await requirePublishingClient(req, res);
    if (!client) return;
    const theme = await jobPublicationService.updateCareerTheme(client, req.body || {});
    res.json(theme);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to save theme' });
  }
};

const getPosthogAnalytics = async (req, res) => {
  try {
    const client = await requirePublishingClient(req, res);
    if (!client) return;
    const analytics = await jobPublicationService.getPosthogAnalytics(client);
    res.json(analytics);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load PostHog settings' });
  }
};

const updatePosthogAnalytics = async (req, res) => {
  try {
    const client = await requirePublishingClient(req, res);
    if (!client) return;
    const analytics = await jobPublicationService.updatePosthogAnalytics(client, req.body || {});
    res.json(analytics);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to save PostHog settings' });
  }
};

const getLandingContact = async (req, res) => {
  try {
    const client = await requirePublishingClient(req, res);
    if (!client) return;
    const contact = await jobPublicationService.getLandingContact(client);
    res.json(contact);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load landing contact' });
  }
};

const updateLandingContact = async (req, res) => {
  try {
    const client = await requirePublishingClient(req, res);
    if (!client) return;
    const contact = await jobPublicationService.updateLandingContact(client, req.body || {});
    res.json(contact);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to save landing contact' });
  }
};

const listJobCandidates = async (req, res) => {
  try {
    const rows = await jobPublicationService.listCandidatesForJob(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list candidates' });
  }
};

const listPublicBoard = async (req, res) => {
  try {
    const payload = await jobPublicationService.listPublicBoardJobs({
      search: req.query.search,
      location: req.query.location,
      jobType: req.query.jobType,
      client: req.query.client,
    });
    res.set('Cache-Control', 'public, max-age=120');
    res.json(payload);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load job board' });
  }
};

const getPublicBoardBranding = async (req, res) => {
  try {
    const clientParam = req.query.client;
    if (!clientParam) {
      return res.status(400).json({ message: 'Client identifier is required' });
    }
    const branding = await jobPublicationService.getPublicBoardBranding(clientParam);
    res.set('Cache-Control', 'public, max-age=300');
    res.json(branding);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load board branding' });
  }
};

const getHeroGallery = async (req, res) => {
  try {
    const client = await requirePublishingClient(req, res);
    if (!client) return;
    const images = jobPublicationService.getHeroGallery(client);
    res.json(images);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load gallery' });
  }
};

const addHeroGalleryImage = async (req, res) => {
  try {
    const client = await requirePublishingClient(req, res);
    if (!client) return;
    const { url, label } = req.body || {};
    if (!url || !String(url).trim()) {
      return res.status(400).json({ message: 'url is required' });
    }
    const images = await jobPublicationService.addHeroGalleryImage(client, {
      url: String(url).trim(),
      label: label ? String(label) : '',
    });
    res.status(201).json(images);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to add image' });
  }
};

const removeHeroGalleryImage = async (req, res) => {
  try {
    const client = await requirePublishingClient(req, res);
    if (!client) return;
    const images = await jobPublicationService.removeHeroGalleryImage(client, req.params.imageId);
    res.json(images);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to remove image' });
  }
};

const generateHeroImage = async (req, res) => {
  try {
    const data = await jobPublicationService.generateHeroImageForJob(req.params.id, req.body || {});
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to generate image' });
  }
};

const listCompanyCreatedImages = async (req, res) => {
  try {
    const client = await requirePublishingClient(req, res);
    if (!client) return;
    const images = await jobPublicationService.listCompanyCreatedImages(client);
    res.json(images);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load company images' });
  }
};

const listJobCompanyImages = async (req, res) => {
  try {
    const images = await jobPublicationService.listCompanyCreatedImagesForJob(req.params.id);
    res.json(images);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load company images' });
  }
};

module.exports = {
  getPublicLanding,
  getSharePreview,
  getBoardSharePreview,
  recordVisit,
  submitApplication,
  getPublication,
  updatePublication,
  listLinks,
  listCandidates,
  getStats,
  getTheme,
  updateTheme,
  getPosthogAnalytics,
  updatePosthogAnalytics,
  getLandingContact,
  updateLandingContact,
  listJobCandidates,
  listPublicBoard,
  getPublicBoardBranding,
  getHeroGallery,
  addHeroGalleryImage,
  removeHeroGalleryImage,
  generateHeroImage,
  listCompanyCreatedImages,
  listJobCompanyImages,
};
