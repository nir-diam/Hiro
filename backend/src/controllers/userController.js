const { Op } = require('sequelize');
const User = require('../models/User');
const Client = require('../models/Client');

const STAFF_ROLES = ['manager', 'recruiter'];

/** Non-null client UUID for tenant-scoped staff, or null if unassigned. */
const tenantClientIdOf = (u) => {
  if (!u) return null;
  const raw = u.clientId;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
};

/** List / cross-tenant user admin: only true super-admin or legacy platform admin (admin with no client). */
const canManageStaffAcrossTenants = (u) => {
  if (!u) return false;
  if (u.role === 'super_admin') return true;
  if (u.role === 'admin' && !tenantClientIdOf(u)) return true;
  return false;
};

const stripPassword = (u) => {
  if (!u) return null;
  const row = u.get ? u.get({ plain: true }) : u;
  const { password, ...rest } = row;
  return rest;
};

const loadActor = async (req) => {
  if (req.dbUser) return req.dbUser;
  const userId = req.user?.sub;
  if (!userId) return null;
  return User.findByPk(userId);
};

/** User.clientId, or the only row in `clients` when the DB has a single tenant (no picker needed). */
const effectiveTenantIdOf = async (actor) => {
  const direct = tenantClientIdOf(actor);
  if (direct) return direct;
  const rows = await Client.findAll({ attributes: ['id'], limit: 2 });
  if (rows.length === 1) return rows[0].id;
  return null;
};

const sameTenantAsActor = async (actor, targetUser) => {
  const a = await effectiveTenantIdOf(actor);
  const t = tenantClientIdOf(targetUser);
  if (!a || !t) return false;
  return String(a) === String(t);
};

const list = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!actor) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const where = { role: { [Op.in]: STAFF_ROLES } };

    if (!canManageStaffAcrossTenants(actor)) {
      const tid = await effectiveTenantIdOf(actor);
      if (!tid) {
        res.set('Cache-Control', 'private, no-store');
        return res.json([]);
      }
      where.clientId = tid;
    }

    const users = await User.findAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
    });
    res.set('Cache-Control', 'private, no-store');
    return res.json(users.map((u) => stripPassword(u)));
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to list users' });
  }
};

const getById = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!actor) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findOne({
      where: { id: req.params.id, role: { [Op.in]: STAFF_ROLES } },
      attributes: { exclude: ['password'] },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!canManageStaffAcrossTenants(actor)) {
      if (!(await sameTenantAsActor(actor, user))) {
        return res.status(404).json({ message: 'User not found' });
      }
    }

    return res.json(stripPassword(user));
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to load user' });
  }
};

const create = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!actor) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { email, password, name, role, phone, extension, clientId: bodyClientId } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Role must be manager or recruiter' });
    }
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email already exists' });

    let clientId = null;
    if (canManageStaffAcrossTenants(actor)) {
      clientId = bodyClientId || null;
    } else {
      let tid = tenantClientIdOf(actor);
      const canBootstrapClient = actor.role === 'manager' || actor.role === 'recruiter';
      if (!tid && canBootstrapClient && bodyClientId) {
        const candidate = String(bodyClientId).trim();
        if (candidate) {
          const clientRow = await Client.findByPk(candidate);
          if (!clientRow) {
            return res.status(400).json({ message: 'Invalid clientId: client not found' });
          }
          tid = candidate;
        }
      }
      if (!tid) {
        tid = await effectiveTenantIdOf(actor);
      }
      if (!tid) {
        const hint = canBootstrapClient
          ? ' Set users.clientId for this account, or send "clientId" in the body when you have multiple clients, or use a super_admin / platform admin account.'
          : ' Set users.clientId for this account, or use a super_admin / platform admin account.';
        return res.status(403).json({
          code: 'ACTOR_MISSING_CLIENT',
          message: `Your user has no client and no single-tenant default.${hint}`,
        });
      }
      clientId = tid;
    }

    const user = await User.create({
      email,
      password,
      name: name || email,
      role,
      phone: phone || null,
      extension: extension || null,
      isActive: true,
      clientId,
    });
    return res.status(201).json(stripPassword(user));
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Failed to create user' });
  }
};

const update = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!actor) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findOne({
      where: { id: req.params.id, role: { [Op.in]: STAFF_ROLES } },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!canManageStaffAcrossTenants(actor)) {
      if (!(await sameTenantAsActor(actor, user))) {
        return res.status(404).json({ message: 'User not found' });
      }
    }

    const {
      name,
      email,
      phone,
      extension,
      isActive,
      role,
      dataScope,
      permissions,
      password,
      clientId: nextClientId,
    } = req.body;

    if (email !== undefined && email !== user.email) {
      const taken = await User.findOne({ where: { email } });
      if (taken) return res.status(409).json({ message: 'Email already in use' });
    }
    if (role !== undefined && !STAFF_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Role must be manager or recruiter' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (extension !== undefined) updates.extension = extension;
    if (isActive !== undefined) updates.isActive = isActive;
    if (role !== undefined) updates.role = role;
    if (dataScope !== undefined) updates.dataScope = dataScope;
    if (permissions !== undefined) updates.permissions = permissions;
    if (password !== undefined && String(password).length > 0) {
      updates.password = password;
    }
    if (nextClientId !== undefined && canManageStaffAcrossTenants(actor)) {
      updates.clientId = nextClientId || null;
    }

    await user.update(updates);
    await user.reload({ attributes: { exclude: ['password'] } });
    return res.json(stripPassword(user));
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Failed to update user' });
  }
};

module.exports = { list, getById, create, update };
