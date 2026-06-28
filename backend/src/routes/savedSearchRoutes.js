const express = require('express');
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/authMiddleware');
const { attachDbUser } = require('../middleware/permissionMiddleware');
const SavedSearch = require('../models/SavedSearch');
const SavedSearchBlacklist = require('../models/SavedSearchBlacklist');
const Candidate = require('../models/Candidate');

const assertSavedSearchAccess = (row, userId, clientId) => {
  if (!row) return { ok: false, status: 404, message: 'Not found' };
  const isOwner = row.userId === userId;
  const isPublicPeer = row.isPublic && clientId && row.clientId === clientId;
  if (!isOwner && !isPublicPeer) return { ok: false, status: 403, message: 'Forbidden' };
  return { ok: true };
};

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

    // Attach the per-search blacklist so the client can filter optimistically.
    const searchIds = rows.map((r) => r.id);
    const blacklistRows = searchIds.length
      ? await SavedSearchBlacklist.findAll({ where: { savedSearchId: searchIds } })
      : [];
    const blacklistBySearch = {};
    for (const b of blacklistRows) {
      if (!blacklistBySearch[b.savedSearchId]) blacklistBySearch[b.savedSearchId] = [];
      blacklistBySearch[b.savedSearchId].push({
        candidateEmail: b.candidateEmail,
        candidatePhone: b.candidatePhone,
      });
    }
    const result = rows.map((r) => ({
      ...r.toJSON(),
      blacklist: blacklistBySearch[r.id] || [],
    }));

    res.json(result);
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
      filterState,
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
      filterState: filterState || {},
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
      filterState,
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
      filterState: filterState || {},
    });

    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/saved-searches/:id/blacklist
router.get('/:id/blacklist', async (req, res) => {
  try {
    const userId = req.user.sub;
    const clientId = req.dbUser.clientId;
    const row = await SavedSearch.findByPk(req.params.id);

    const access = assertSavedSearchAccess(row, userId, clientId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const entries = await SavedSearchBlacklist.findAll({
      where: { savedSearchId: row.id },
      order: [['excludedAt', 'DESC']],
    });

    const blacklist = await Promise.all(entries.map(async (b) => {
      let candidate = null;
      if (b.candidateEmail) {
        candidate = await Candidate.findOne({
          where: { email: b.candidateEmail },
          attributes: ['id', 'fullName', 'email', 'phone'],
        });
      }
      if (!candidate && b.candidatePhone) {
        candidate = await Candidate.findOne({
          where: { phone: b.candidatePhone },
          attributes: ['id', 'fullName', 'email', 'phone'],
        });
      }
      return {
        candidateId: candidate?.id || null,
        candidateEmail: b.candidateEmail,
        candidatePhone: b.candidatePhone,
        candidateName: candidate?.fullName || null,
      };
    }));

    res.json({ blacklist });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/saved-searches/:id/blacklist
// Adds a candidate to the per-search blacklist by email and/or phone.
// Keyed on stable identifiers so re-submitted CVs with new UUIDs are still blocked.
router.post('/:id/blacklist', async (req, res) => {
  try {
    const userId = req.user.sub;
    const row = await SavedSearch.findByPk(req.params.id);

    if (!row) return res.status(404).json({ message: 'Not found' });
    if (row.userId !== userId) return res.status(403).json({ message: 'Forbidden' });

    const { candidateEmail, candidatePhone } = req.body;
    if (!candidateEmail && !candidatePhone) {
      return res.status(400).json({ message: 'candidateEmail or candidatePhone is required' });
    }

    const email = candidateEmail ? String(candidateEmail).trim().toLowerCase() : null;
    const phone = candidatePhone ? String(candidatePhone).trim() : null;

    // Avoid exact duplicates for this search.
    const existing = await SavedSearchBlacklist.findOne({
      where: {
        savedSearchId: row.id,
        ...(email ? { candidateEmail: email } : {}),
        ...(phone && !email ? { candidatePhone: phone } : {}),
      },
    });

    if (!existing) {
      await SavedSearchBlacklist.create({
        savedSearchId: row.id,
        candidateEmail: email,
        candidatePhone: phone,
        excludedBy: userId,
      });
    }

    const blacklist = await SavedSearchBlacklist.findAll({
      where: { savedSearchId: row.id },
      attributes: ['candidateEmail', 'candidatePhone'],
    });

    res.json({ blacklist: blacklist.map((b) => ({ candidateEmail: b.candidateEmail, candidatePhone: b.candidatePhone })) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/saved-searches/:id/blacklist
router.delete('/:id/blacklist', async (req, res) => {
  try {
    const userId = req.user.sub;
    const clientId = req.dbUser.clientId;
    const row = await SavedSearch.findByPk(req.params.id);

    const access = assertSavedSearchAccess(row, userId, clientId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });
    if (row.userId !== userId) return res.status(403).json({ message: 'Forbidden' });

    const { candidateEmail, candidatePhone } = req.body;
    if (!candidateEmail && !candidatePhone) {
      return res.status(400).json({ message: 'candidateEmail or candidatePhone is required' });
    }

    const email = candidateEmail ? String(candidateEmail).trim().toLowerCase() : null;
    const phone = candidatePhone ? String(candidatePhone).trim() : null;

    const where = { savedSearchId: row.id };
    if (email) where.candidateEmail = email;
    if (phone) where.candidatePhone = phone;

    await SavedSearchBlacklist.destroy({ where });

    const blacklist = await SavedSearchBlacklist.findAll({
      where: { savedSearchId: row.id },
      attributes: ['candidateEmail', 'candidatePhone'],
    });

    res.json({ blacklist: blacklist.map((b) => ({ candidateEmail: b.candidateEmail, candidatePhone: b.candidatePhone })) });
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
