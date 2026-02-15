const helpCenterService = require('../services/helpCenterService');

const listArticles = async (_req, res) => {
  try {
    const articles = await helpCenterService.listArticles();
    res.json(articles);
  } catch (err) {
    console.error('[helpCenterController.listArticles]', err);
    res.status(500).json({ message: err.message || 'Unable to list help articles' });
  }
};

const createArticle = async (req, res) => {
  try {
    const payload = {
      parentId: req.body.parentId || null,
      title: req.body.title,
      type: ['folder', 'article'].includes(req.body.type) ? req.body.type : 'article',
      content: req.body.content || null,
      videoUrl: req.body.videoUrl || null,
      order: typeof req.body.order === 'number' ? req.body.order : 0,
    };
    const article = await helpCenterService.createArticle(payload);
    res.status(201).json(article);
  } catch (err) {
    console.error('[helpCenterController.createArticle]', err);
    res.status(400).json({ message: err.message || 'Unable to create article' });
  }
};

const updateArticle = async (req, res) => {
  try {
    const updates = {
      title: req.body.title,
      content: req.body.content,
      videoUrl: req.body.videoUrl,
      type: ['folder', 'article'].includes(req.body.type) ? req.body.type : undefined,
      parentId: req.body.hasOwnProperty('parentId') ? req.body.parentId : undefined,
      order: typeof req.body.order === 'number' ? req.body.order : undefined,
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
    const updated = await helpCenterService.updateArticle(req.params.id, updates);
    if (!updated) return res.status(404).json({ message: 'Article not found' });
    res.json(updated);
  } catch (err) {
    console.error('[helpCenterController.updateArticle]', err);
    res.status(400).json({ message: err.message || 'Unable to update article' });
  }
};

const deleteArticle = async (req, res) => {
  try {
    const deleted = await helpCenterService.deleteArticle(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Article not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[helpCenterController.deleteArticle]', err);
    res.status(400).json({ message: err.message || 'Unable to delete article' });
  }
};

module.exports = {
  listArticles,
  createArticle,
  updateArticle,
  deleteArticle,
};

