const express = require('express');
const agentController = require('../controllers/agentController');
const agentAuthMiddleware = require('../middleware/agentAuthMiddleware');
const requireAgentScope = require('../middleware/requireAgentScope');
const agentRequestLogger = require('../middleware/agentRequestLogger');
const { AGENT_SCOPES } = require('../constants/agentScopes');

const router = express.Router();

router.use(agentAuthMiddleware);
router.use(agentRequestLogger);

router.get('/health', requireAgentScope(AGENT_SCOPES.PING), agentController.health);
router.get('/me', requireAgentScope(AGENT_SCOPES.PING), agentController.me);
router.get('/capabilities', requireAgentScope(AGENT_SCOPES.PING), agentController.getCapabilities);

router.get(
  '/tag-ai-decisions',
  requireAgentScope(AGENT_SCOPES.TAG_AI_DECISIONS_READ),
  agentController.listTagAiDecisions,
);
router.get(
  '/tag-ai-decisions/:id',
  requireAgentScope(AGENT_SCOPES.TAG_AI_DECISIONS_READ),
  agentController.getTagAiDecision,
);
router.get(
  '/tag-ai-decisions/:id/candidates',
  requireAgentScope(AGENT_SCOPES.TAG_AI_DECISIONS_READ),
  agentController.getTagAiDecisionCandidates,
);
router.patch(
  '/tag-ai-decisions/:id',
  requireAgentScope(AGENT_SCOPES.TAG_AI_DECISIONS_WRITE),
  agentController.patchTagAiDecision,
);
router.patch(
  '/tag-ai-decisions/:id/execute',
  requireAgentScope(AGENT_SCOPES.TAG_AI_DECISIONS_WRITE),
  agentController.executeTagAiDecision,
);

router.get(
  '/organization-ai-decisions',
  requireAgentScope(AGENT_SCOPES.ORG_AI_DECISIONS_READ),
  agentController.listOrganizationAiDecisions,
);
router.get(
  '/organization-ai-decisions/:id',
  requireAgentScope(AGENT_SCOPES.ORG_AI_DECISIONS_READ),
  agentController.getOrganizationAiDecision,
);
router.patch(
  '/organization-ai-decisions/:id',
  requireAgentScope(AGENT_SCOPES.ORG_AI_DECISIONS_WRITE),
  agentController.patchOrganizationAiDecision,
);
router.patch(
  '/organization-ai-decisions/:id/execute',
  requireAgentScope(AGENT_SCOPES.ORG_AI_DECISIONS_WRITE),
  agentController.executeOrganizationAiDecision,
);
router.patch(
  '/organization-ai-decisions/:id/staging-company',
  requireAgentScope(AGENT_SCOPES.ORG_AI_DECISIONS_WRITE),
  agentController.patchStagingCompany,
);

router.get(
  '/tags',
  requireAgentScope(AGENT_SCOPES.TAGS_READ),
  agentController.listTags,
);
router.get(
  '/tags/:id',
  requireAgentScope(AGENT_SCOPES.TAGS_READ),
  agentController.getTag,
);
router.post(
  '/tags/merge',
  requireAgentScope(AGENT_SCOPES.TAGS_WRITE),
  agentController.mergeTags,
);
router.post(
  '/tags/:id/enrich',
  requireAgentScope(AGENT_SCOPES.TAGS_WRITE),
  agentController.enrichTag,
);
router.patch(
  '/tags/:id/execute',
  requireAgentScope(AGENT_SCOPES.TAGS_WRITE),
  agentController.executeTag,
);

router.get(
  '/organizations',
  requireAgentScope(AGENT_SCOPES.ORGANIZATIONS_READ),
  agentController.listOrganizations,
);
router.get(
  '/organizations/duplicates',
  requireAgentScope(AGENT_SCOPES.ORGANIZATIONS_READ),
  agentController.listOrganizationDuplicates,
);
router.post(
  '/organizations',
  requireAgentScope(AGENT_SCOPES.ORGANIZATIONS_WRITE),
  agentController.createOrganization,
);
router.post(
  '/organizations/merge',
  requireAgentScope(AGENT_SCOPES.ORGANIZATIONS_WRITE),
  agentController.mergeOrganizations,
);
router.get(
  '/organizations/:id',
  requireAgentScope(AGENT_SCOPES.ORGANIZATIONS_READ),
  agentController.getOrganization,
);
router.patch(
  '/organizations/:id/execute',
  requireAgentScope(AGENT_SCOPES.ORGANIZATIONS_WRITE),
  agentController.executeOrganization,
);
router.post(
  '/organizations/:id/enrich',
  requireAgentScope(AGENT_SCOPES.ORGANIZATIONS_WRITE),
  agentController.enrichOrganization,
);

router.get(
  '/audit-logs',
  requireAgentScope(AGENT_SCOPES.AUDIT_LOGS_READ),
  agentController.listAuditLogs,
);

router.post(
  '/clients/:clientId/organization-link',
  requireAgentScope(AGENT_SCOPES.CLIENTS_WRITE),
  agentController.linkClientOrganization,
);
router.get(
  '/clients/:clientId/contacts',
  requireAgentScope(AGENT_SCOPES.CLIENTS_READ),
  agentController.listClientContacts,
);
router.post(
  '/clients/:clientId/contacts',
  requireAgentScope(AGENT_SCOPES.CLIENTS_WRITE),
  agentController.createClientContact,
);
router.patch(
  '/clients/:clientId/contacts/:contactId',
  requireAgentScope(AGENT_SCOPES.CLIENTS_WRITE),
  agentController.updateClientContact,
);
router.delete(
  '/clients/:clientId/contacts/:contactId',
  requireAgentScope(AGENT_SCOPES.CLIENTS_WRITE),
  agentController.deleteClientContact,
);

module.exports = router;
