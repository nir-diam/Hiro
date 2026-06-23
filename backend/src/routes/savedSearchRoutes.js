const express = require('express');
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/authMiddleware');
const { attachDbUser } = require('../middleware/permissionMiddleware');
const SavedSearch = require('../models/SavedSearch');

const router = express.Router();

router.use(authMiddleware, attachDbUser);

// GET /api/saved-searches
// Returns the current user's searches + public searches from the same client.
router.get('/', async (req, res) => {
  try {
    const userId = req.user.sub;
    const clientId = req.dbUser.clientId;

    const where = clientId
      ? { [Op.or]: [{ userId }, { clientId, isPublic: true }] }
      : { userId };

    const rows = await SavedSearch.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/saved-searches
router.post('/', async (req, res) => {
  try {
    const userId = req.user.sub;
    const clientId = req.dbUser.clientId || null;

    const {
      name, isPublic, searchParams, additionalFilters,
      languageFilters, isAlert, frequency, notificationMethods,
    } = req.body;

    const row = await SavedSearch.create({
      userId,
      clientId,
      name,
      isPublic: !!isPublic,
      searchParams: searchParams || {},
      additionalFilters: additionalFilters || [],
      languageFilters: languageFilters || [],
      isAlert: !!isAlert,
      frequency: frequency || null,
      notificationMethods: notificationMethods || [],
    });

    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/saved-searches/:id
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.sub;
    const row = await SavedSearch.findByPk(req.params.id);

    if (!row) return res.status(404).json({ message: 'Not found' });
    if (row.userId !== userId) return res.status(403).json({ message: 'Forbidden' });

    const {
      name, isPublic, searchParams, additionalFilters,
      languageFilters, isAlert, frequency, notificationMethods,
    } = req.body;

    await row.update({
      name,
      isPublic: !!isPublic,
      searchParams: searchParams || {},
      additionalFilters: additionalFilters || [],
      languageFilters: languageFilters || [],
      isAlert: !!isAlert,
      frequency: frequency || null,
      notificationMethods: notificationMethods || [],
    });

    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/saved-searches/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.sub;
    const row = await SavedSearch.findByPk(req.params.id);

    if (!row) return res.status(404).json({ message: 'Not found' });
    if (row.userId !== userId) return res.status(403).json({ message: 'Forbidden' });

    await row.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
