const agentAuthService = require('../services/agentAuthService');
const agentAiDecisionService = require('../services/agentAiDecisionService');
const agentOrganizationService = require('../services/agentOrganizationService');
const agentTagService = require('../services/agentTagService');
const agentAuditService = require('../services/agentAuditService');
const agentClientService = require('../services/agentClientService');
const { AGENT_CAPABILITIES } = require('../constants/agentCapabilities');

const handleServiceError = (res, err) =>
  res.status(err.status || 500).json({
    message: err.message || 'Request failed',
    ...(err.code ? { code: err.code } : {}),
  });

const me = async (req, res) => {
  return res.json({ agent: req.agent || agentAuthService.publicAgentView() });
};

const health = async (_req, res) => {
  return res.json({ status: 'ok', service: 'hiro-agent-api' });
};

const getCapabilities = async (_req, res) => {
  return res.json({ data: AGENT_CAPABILITIES });
};

const listTagAiDecisions = async (req, res) => {
  try {
    const payload = await agentAiDecisionService.listTagAiDecisions(req.query);
    return res.json(payload);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const getTagAiDecision = async (req, res) => {
  try {
    const item = await agentAiDecisionService.getTagAiDecision(req.params.id);
    return res.json({ data: item });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const getTagAiDecisionCandidates = async (req, res) => {
  try {
    const item = await agentAiDecisionService.getTagAiDecisionCandidates(req.params.id);
    return res.json({ data: item });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const patchTagAiDecision = async (req, res) => {
  try {
    const item = await agentAiDecisionService.patchTagAiDecision(req.params.id, req.body, req);
    return res.json({ data: item });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const executeTagAiDecision = async (req, res) => {
  try {
    const result = await agentAiDecisionService.executeTagAiDecision(req.params.id, req.body, req);
    return res.json(result);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const listOrganizationAiDecisions = async (req, res) => {
  try {
    const payload = await agentAiDecisionService.listOrganizationAiDecisions(req.query);
    return res.json(payload);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const getOrganizationAiDecision = async (req, res) => {
  try {
    const item = await agentAiDecisionService.getOrganizationAiDecision(req.params.id);
    return res.json({ data: item });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const patchOrganizationAiDecision = async (req, res) => {
  try {
    const item = await agentAiDecisionService.patchOrganizationAiDecision(req.params.id, req.body, req);
    return res.json({ data: item });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const executeOrganizationAiDecision = async (req, res) => {
  try {
    const result = await agentAiDecisionService.executeOrganizationAiDecision(req.params.id, req.body, req);
    return res.json(result);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const enrichOrganization = async (req, res) => {
  try {
    const result = await agentOrganizationService.enrichOrganization(req.params.id, req);
    return res.json({ data: result });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const mergeOrganizations = async (req, res) => {
  try {
    const result = await agentOrganizationService.mergeOrganizations(req.body, req);
    return res.json({ data: result });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const listTags = async (req, res) => {
  try {
    const payload = await agentTagService.listTags(req.query);
    return res.json(payload);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const getTag = async (req, res) => {
  try {
    const item = await agentTagService.getTag(req.params.id);
    return res.json({ data: item });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const mergeTags = async (req, res) => {
  try {
    const result = await agentTagService.mergeTags(req.body, req);
    return res.json(result);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const executeTag = async (req, res) => {
  try {
    const result = await agentTagService.executeTag(req.params.id, req.body, req);
    return res.json(result);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const executeOrganization = async (req, res) => {
  try {
    const result = await agentOrganizationService.executeOrganization(req.params.id, req.body, req);
    return res.json(result);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const listOrganizations = async (req, res) => {
  try {
    const payload = await agentOrganizationService.listOrganizations(req.query);
    return res.json(payload);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const getOrganization = async (req, res) => {
  try {
    const item = await agentOrganizationService.getOrganization(req.params.id);
    return res.json({ data: item });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const patchStagingCompany = async (req, res) => {
  try {
    const result = await agentOrganizationService.patchStagingCompanyForDecision(
      req.params.id,
      req.body,
      req,
    );
    return res.json({ data: result });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const listAuditLogs = async (req, res) => {
  try {
    const payload = await agentAuditService.listAgentAuditLogs(req.query);
    return res.json(payload);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const linkClientOrganization = async (req, res) => {
  try {
    const client = await agentClientService.linkOrganization(req.params.clientId, req.body, req);
    return res.json(client);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const listClientContacts = async (req, res) => {
  try {
    const rows = await agentClientService.listContacts(req.params.clientId, req.query);
    return res.json(rows);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const createClientContact = async (req, res) => {
  try {
    const row = await agentClientService.createContact(req.params.clientId, req.body, req);
    return res.status(201).json(row);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const updateClientContact = async (req, res) => {
  try {
    const row = await agentClientService.updateContact(
      req.params.clientId,
      req.params.contactId,
      req.body,
      req,
    );
    return res.json(row);
  } catch (err) {
    return handleServiceError(res, err);
  }
};

const deleteClientContact = async (req, res) => {
  try {
    await agentClientService.deleteContact(req.params.clientId, req.params.contactId, req);
    return res.status(204).end();
  } catch (err) {
    return handleServiceError(res, err);
  }
};

module.exports = {
  me,
  health,
  getCapabilities,
  listTagAiDecisions,
  getTagAiDecision,
  getTagAiDecisionCandidates,
  patchTagAiDecision,
  executeTagAiDecision,
  listOrganizationAiDecisions,
  getOrganizationAiDecision,
  patchOrganizationAiDecision,
  executeOrganizationAiDecision,
  listTags,
  getTag,
  listOrganizations,
  getOrganization,
  enrichOrganization,
  mergeOrganizations,
  mergeTags,
  executeTag,
  executeOrganization,
  patchStagingCompany,
  listAuditLogs,
  linkClientOrganization,
  listClientContacts,
  createClientContact,
  updateClientContact,
  deleteClientContact,
};
