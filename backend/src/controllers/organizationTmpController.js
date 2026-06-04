const { Op } = require('sequelize');
const Organization = require('../models/Organization');
const OrganizationTmp = require('../models/OrganizationTmp');
const OrganizationHistory = require('../models/OrganizationHistory');
const Candidate = require('../models/Candidate');
const CandidateOrganization = require('../models/CandidateOrganization');

const ATTRIBUTES_TO_COPY = [
  'name',
  'nameEn',
  'legalName',
  'aliases',
  'mainField',
  'subField',
  'tags',
  'techTags',
  'employeeCount',
  'type',
  'website',
  'linkedinUrl',
  'location',
  'hqCountry',
  'classification',
  'relation',
  'foundedYear',
  'businessModel',
  'productType',
  'structure',
  'parentCompany',
  'subsidiaries',
  'growthIndicator',
  'dataConfidence',
  'lastVerified',
  'description',
  'candidateCount',
  'candidateId',
];

const list = async (_req, res) => {
  const entries = await OrganizationTmp.findAll({
    order: [['createdAt', 'DESC']],
    include: [{ model: Candidate, as: 'candidate', attributes: ['id', 'fullName'] }],
  });
  res.json(entries);
};

const listHistory = async (_req, res) => {
  const entries = await OrganizationHistory.findAll({ order: [['createdAt', 'DESC']] });
  res.json(entries);
};

const shouldLinkCandidateToOrg = (entry, payload, actionType) => {
  if (!entry.candidateId) return false;
  if (actionType === 'create') return true;
  if (actionType !== 'link') return false;
  const isCompany =
    typeof payload.isCompany === 'boolean' ? payload.isCompany : entry.isCompany;
  return isCompany !== false;
};

const resolve = async (req, res) => {
  const {
    ids,
    add = false,
    actionType = 'delete',
    flags = [],
    resolvedValue,
    organizationId,
  } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Missing ids array' });
  }

  const entries = await OrganizationTmp.findAll({ where: { id: ids } });
  if (!entries.length) {
    return res.json({ success: true, removed: [] });
  }

  const removedIds = [];
  const seenNames = new Set();
  const candidateIdsToLink = new Set();

  for (const entry of entries) {
    const payload = {};
    ATTRIBUTES_TO_COPY.forEach((attr) => {
      if (entry[attr] !== undefined) {
        payload[attr] = entry[attr];
      }
    });
    const override = flags.find((flag) => flag.id === entry.id);
    if (override && typeof override.isCompany === 'boolean') {
      payload.isCompany = override.isCompany;
    }
    if (actionType === 'create' && typeof payload.isCompany === 'undefined') {
      payload.isCompany = true;
    }
    if (resolvedValue) {
      payload.resolvedValue = resolvedValue;
    }
    payload.resolutionType = actionType;
    await OrganizationHistory.create(payload);
    await entry.destroy();
    removedIds.push(entry.id);
    const normalized = (entry.name || '').trim().toLowerCase();
    if (normalized) seenNames.add(normalized);

    if (shouldLinkCandidateToOrg(entry, payload, actionType)) {
      candidateIdsToLink.add(entry.candidateId);
    }
  }

  if (seenNames.size) {
    const filters = [];
    seenNames.forEach((name) => {
      filters.push({ name: { [Op.iLike]: name } });
    });
    if (filters.length) {
      await OrganizationTmp.destroy({ where: { [Op.or]: filters } });
    }
  }

  let linkedOrganizationId = null;
  let linkedCandidateCount = 0;

  if (
    (actionType === 'link' || actionType === 'create') &&
    candidateIdsToLink.size > 0
  ) {
    let org = null;
    if (organizationId) {
      org = await Organization.findByPk(organizationId);
    }
    if (!org) {
      const nameCandidates = [];
      if (resolvedValue) nameCandidates.push(String(resolvedValue).trim());
      for (const entry of entries) {
        if (entry.name) nameCandidates.push(String(entry.name).trim());
      }
      for (const name of nameCandidates) {
        if (!name) continue;
        // eslint-disable-next-line no-await-in-loop
        org = await Organization.findOne({
          where: { name: { [Op.iLike]: name } },
        });
        if (org) break;
      }
    }
    if (org?.id) {
      linkedOrganizationId = org.id;
      for (const candidateId of candidateIdsToLink) {
        // eslint-disable-next-line no-await-in-loop
        await CandidateOrganization.findOrCreate({
          where: { candidateId, organizationId: org.id },
        });
        linkedCandidateCount += 1;
      }
    }
  }

  res.json({
    success: true,
    removed: removedIds,
    organizationId: linkedOrganizationId,
    linkedCandidates: linkedCandidateCount,
  });
};

module.exports = { list, resolve, listHistory };

