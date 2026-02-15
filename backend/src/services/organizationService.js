const { Op } = require('sequelize');
const Organization = require('../models/Organization');
const { sendChat } = require('./geminiService');
const OrganizationTmp = require('../models/OrganizationTmp');
const picklistService = require('./picklistService');

const list = async () => Organization.findAll();

const getById = async (id) => {
  const org = await Organization.findByPk(id);
  if (!org) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  return org;
};

const findByAnyName = async ({ name, nameEn, legalName }) => {
  const candidates = [];
  const pushCandidate = (field, value) => {
    if (value && String(value).trim()) {
      candidates.push({
        [field]: {
          [Op.iLike]: String(value).trim(),
        },
      });
    }
  };

  pushCandidate('name', name);
  pushCandidate('nameEn', nameEn);
  pushCandidate('legalName', legalName);

  if (!candidates.length) return null;
  return Organization.findOne({
    where: {
      [Op.or]: candidates,
    },
  });
};

const ensureIndustryPicklistEntries = async (mainField, subField) => {
  if (!mainField) return null;
  const mainCategory = await picklistService.ensureMainFieldCategory(mainField);
  if (mainCategory && subField) {
    await picklistService.ensureCategoryValueByLabel(mainCategory.id, subField);
  }
  return mainCategory;
};

const create = async (payload) => {
  const existing = await findByAnyName(payload);
  if (existing) {
    const err = new Error('Company already exists in the global database');
    err.status = 409;
    err.existing = {
      id: existing.id,
      name: existing.name,
      nameEn: existing.nameEn,
      legalName: existing.legalName,
    };
    throw err;
  }
  await ensureIndustryPicklistEntries(payload.mainField, payload.subField);
  return Organization.create(payload);
};

const update = async (id, payload) => {
  const org = await getById(id);
  await ensureIndustryPicklistEntries(payload.mainField || org.mainField, payload.subField || org.subField);
  await org.update(payload);
  return org;
};

const remove = async (id) => {
  const org = await getById(id);
  await org.destroy();
};

const getByIds = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const uniqueIds = Array.from(new Set(ids));
  return Organization.findAll({ where: { id: uniqueIds } });
};

const findByName = async (name) => {
  if (!name || !String(name).trim()) return null;
  const trimmed = String(name).trim();
  const org = await Organization.findOne({
    where: {
      name: {
        [Op.iLike]: trimmed,
      },
    },
  });
  if (org) return org;
  return findByAlias(trimmed);
};

const findByAlias = async (aliasValue) => {
  if (!aliasValue || !String(aliasValue).trim()) return null;
  const trimmed = String(aliasValue).trim();
  const sequelize = Organization.sequelize;
  if (!sequelize) return null;
  const escaped = sequelize.escape(trimmed);
  const aliasCondition = sequelize.literal(
    `EXISTS (SELECT 1 FROM unnest(COALESCE("aliases", ARRAY[]::text[])) alias WHERE LOWER(alias) = LOWER(${escaped}))`
  );
  return Organization.findOne({ where: aliasCondition });
};

const findTmpByName = async (name) => {
  if (!name || !String(name).trim()) return null;
  const trimmed = String(name).trim();
  return OrganizationTmp.findOne({
    where: {
      name: {
        [Op.iLike]: trimmed,
      },
    },
  });
};

const findOrCreateByName = async (name, defaults = {}) => {
  if (!name || !String(name).trim()) return null;
  const trimmed = String(name).trim();
  const existing = await findByName(trimmed);
  if (existing) return existing;
  const existingTmp = await findTmpByName(trimmed);
  if (existingTmp) return existingTmp;
  else
  {
    // go to gimini sercice and check with the llm if this is a new company or an existing one or its not a company at all  
    const prompt = `
        You are a corporate intelligence assistant.
        I will provide a company details in free text...
        You need to check if this contain a real company or not.
        you just need to false if not exist or the company name if exist.
        `;
    const response = await sendChat({
      apiKey: process.env.GIMINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY,
      systemPrompt: prompt,
      history: [],
      message: name,
    });
    const llmResponse = response;
    const tmpPayload = {
      name: llmResponse === 'false' ? trimmed : response,
      title: trimmed,
      isCompany: llmResponse !== 'false',
      llmResponse,
      ...defaults,
    };
    return OrganizationTmp.create(tmpPayload);
  } 
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  getByIds,
  findByName,
  findOrCreateByName,
};

