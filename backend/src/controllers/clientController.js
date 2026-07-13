const clientService = require('../services/clientService');
const clientAuditService = require('../services/clientAuditService');
const authService = require('../services/authService');
const { provisionMainContactManager, STAFF_ROLES } = require('../services/staffUserProvisioningService');
const { Op } = require('sequelize');
const User = require('../models/User');

const list = async (req, res) => {
  const raw = req.query?.activeOnly;
  const activeOnly = raw === true || raw === 'true' || raw === '1';

  const user = req.dbUser;
  if (user) {
    const effectiveClientId = await authService.resolveEffectiveClientIdForUser(user);
    if (effectiveClientId && !clientService.isPlatformAdmin(user)) {
      try {
        const client = await clientService.getById(effectiveClientId);
        if (activeOnly && client.isActive === false) {
          res.set('Cache-Control', 'private, no-store');
          return res.json([]);
        }
        res.set('Cache-Control', 'private, no-store');
        return res.json([client]);
      } catch (err) {
        if (err.status === 404) {
          res.set('Cache-Control', 'private, no-store');
          return res.json([]);
        }
        throw err;
      }
    }
  }

  const clients = await clientService.list({ activeOnly });
  res.json(clients);
};

const get = async (req, res) => {
  try {
    const client = await clientService.getByIdWithLinks(req.params.id);
    res.json(client);
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const create = async (req, res) => {
  try {
    const actor = req.dbUser;
    if (clientService.isClientManager(actor)) {
      return res.status(403).json({
        message: 'Managers cannot create new clients. Use organization link for your tenant client.',
      });
    }

    const client = await clientService.create(req.body);
    const skipOrgStaging = clientService.isPlatformAdmin(actor) || req.body?.skipOrganizationLink === true;
    const linked = await clientService.attachOrganizationAfterCreate(client, req.body, {
      skipOrganizationStaging: skipOrgStaging,
    }).catch((err) => {
      console.error('[clientController.create] organization link failed', err?.message || err);
      return client;
    });
    await clientAuditService.recordClientCreated(req, linked).catch((err) => {
      console.error('[clientController.create] audit failed', err?.message || err);
    });

    let managerInvite = null;
    const mainContactEmail = String(req.body?.mainContactEmail || '').trim();
    if (clientService.isPlatformAdmin(actor) && mainContactEmail) {
      const clientPlain = linked.get ? linked.get({ plain: true }) : linked;
      try {
        managerInvite = await provisionMainContactManager({
          clientId: clientPlain.id,
          email: mainContactEmail,
          name: req.body?.mainContactName,
          phone: req.body?.mainContactPhone,
          contactRoleTitle: req.body?.metadata?.contactRole,
          actor,
          clientName: clientPlain.displayName || clientPlain.name,
        });
      } catch (err) {
        console.error('[clientController.create] manager invite failed', err?.message || err);
        managerInvite = { ok: false, error: err.message || 'Failed to invite manager' };
      }
    }

    const payload = linked.get ? linked.get({ plain: true }) : { ...linked };
    if (managerInvite) payload.managerInvite = managerInvite;
    res.status(201).json(payload);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Create failed' });
  }
};

/** Manager: link Organization / stage OrganizationTmp for an existing tenant client. */
const linkOrganization = async (req, res) => {
  try {
    const actor = req.dbUser;
    if (!actor) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const clientId = String(req.params.id || '').trim();
    if (!clientId) {
      return res.status(400).json({ message: 'client id required' });
    }

    if (!clientService.isPlatformAdmin(actor)) {
      if (!actor.clientId || String(actor.clientId) !== clientId) {
        return res.status(403).json({ message: 'You may only link organizations for your own client' });
      }
    }

    const client = await clientService.linkOrganizationForClient(clientId, req.body);
    res.json(client);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Link failed' });
  }
};

const update = async (req, res) => {
  try {
    const before = await clientService.getById(req.params.id);
    const client = await clientService.update(req.params.id, req.body);
    await clientAuditService.recordClientChanges(req, before, client).catch((err) => {
      console.error('[clientController.update] audit failed', err?.message || err);
    });
    res.json(client);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await clientService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

/** Linked Organization / OrganizationTmp rows for a tenant client (M:N via client_organization_links). */
const listLinkedOrganizations = async (req, res) => {
  try {
    const clientId = String(req.params.id || '').trim();
    clientService.assertCanAccessClientOrganizations(req.dbUser, clientId);
    const links = await clientService.listLinkedOrganizationsForClient(clientId);
    res.json(links);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list linked organizations' });
  }
};

/** Remove a client–organization link (does not delete Organization / OrganizationTmp). */
const unlinkOrganization = async (req, res) => {
  try {
    const clientId = String(req.params.id || '').trim();
    const linkId = String(req.params.linkId || '').trim();
    if (!clientId || !linkId) {
      return res.status(400).json({ message: 'client id and link id required' });
    }
    await clientService.unlinkOrganizationFromClient(clientId, linkId, req.dbUser);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Unlink failed' });
  }
};

/** Staff users (User.clientId) for job distribution / notifications — no passwords. */
const listStaffUsers = async (req, res) => {
  try {
    const clientId = req.params.id;
    const rows = await User.findAll({
      where: { clientId, role: { [Op.in]: STAFF_ROLES } },
      attributes: ['id', 'name', 'email', 'role', 'phone', 'extension', 'isActive', 'createdAt', 'clientId'],
      order: [['name', 'ASC']],
    });
    res.json(rows.map((u) => u.toJSON()));
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to list staff users' });
  }
};

module.exports = { list, get, create, update, remove, listStaffUsers, linkOrganization, listLinkedOrganizations, unlinkOrganization };
