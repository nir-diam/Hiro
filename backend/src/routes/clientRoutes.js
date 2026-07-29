const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = authMiddleware.optionalAuth;
const { attachDbUser, optionalAttachDbUser } = require('../middleware/permissionMiddleware');
const clientController = require('../controllers/clientController');
const clientUsageSettingController = require('../controllers/clientUsageSettingController');
const matchingEngineController = require('../controllers/matchingEngineController');
const clientContactController = require('../controllers/clientContactController');
const clientTaskController = require('../controllers/clientTaskController');
const clientEventController = require('../controllers/clientEventController');
const clientDocumentController = require('../controllers/clientDocumentController');
const clientFinanceController = require('../controllers/clientFinanceController');
const clientPipelineController = require('../controllers/clientPipelineController');
const clientHealthRuleController = require('../controllers/clientHealthRuleController');
const jobHealthRuleController = require('../controllers/jobHealthRuleController');
const recruitmentStatusController = require('../controllers/recruitmentStatusController');
const recruitmentSourceController = require('../controllers/recruitmentSourceController');

const router = express.Router();

router.get('/', optionalAuth, optionalAttachDbUser, clientController.list);
router.get('/all-contacts', authMiddleware, attachDbUser, clientContactController.listAll);
router.get('/all-tasks', clientTaskController.listAll);
router.get('/:id/contacts', authMiddleware, attachDbUser, clientContactController.list);
router.post('/:id/contacts', authMiddleware, attachDbUser, clientContactController.create);
router.put('/:id/contacts/:contactId', authMiddleware, attachDbUser, clientContactController.update);
router.delete('/:id/contacts/:contactId', authMiddleware, attachDbUser, clientContactController.remove);

router.get('/:id/contact-groups', authMiddleware, attachDbUser, clientContactController.listGroups);
router.post('/:id/contact-groups', authMiddleware, attachDbUser, clientContactController.createGroup);
router.delete('/:id/contact-groups/:groupId', authMiddleware, attachDbUser, clientContactController.deleteGroup);

router.get('/:id/tasks', clientTaskController.list);
router.post('/:id/tasks', clientTaskController.create);
router.put('/:id/tasks/:taskId', clientTaskController.update);
router.delete('/:id/tasks/:taskId', clientTaskController.remove);

router.get('/:id/linked-jobs', authMiddleware, attachDbUser, clientController.listLinkedJobs);

router.get('/:id/events', clientEventController.list);
router.post('/:id/events', clientEventController.create);
router.put('/:id/events/:eventId', clientEventController.update);
router.delete('/:id/events/:eventId', clientEventController.remove);

router.get('/:id/documents', clientDocumentController.list);
router.post('/:id/documents/upload-url', clientDocumentController.createUploadUrl);
router.post('/:id/documents/attach', clientDocumentController.attach);
router.put('/:id/documents/:docId', clientDocumentController.update);
router.delete('/:id/documents/:docId', clientDocumentController.remove);

router.get('/:id/finance', clientFinanceController.get);
router.put('/:id/finance', clientFinanceController.update);

router.get('/:id/staff-users', clientController.listStaffUsers);

router.get(
  '/:id/linked-organizations',
  authMiddleware,
  attachDbUser,
  clientController.listLinkedOrganizations,
);

router.get(
  '/:id/job-companies',
  authMiddleware,
  attachDbUser,
  clientController.listJobCompanies,
);

router.post(
  '/:id/organization-link',
  authMiddleware,
  attachDbUser,
  clientController.linkOrganization,
);

router.delete(
  '/:id/organization-link/:linkId',
  authMiddleware,
  attachDbUser,
  clientController.unlinkOrganization,
);

router.patch(
  '/:id/organization-link/:linkId',
  authMiddleware,
  attachDbUser,
  clientController.updateOrganizationLink,
);

router.get(
  '/:id/usage-settings',
  authMiddleware,
  attachDbUser,
  clientUsageSettingController.get,
);
router.put(
  '/:id/usage-settings',
  authMiddleware,
  attachDbUser,
  clientUsageSettingController.update,
);

router.get(
  '/:id/matching-engine-configs',
  authMiddleware,
  attachDbUser,
  matchingEngineController.listPresetsForClient,
);

router.get(
  '/:id/recruitment-statuses',
  authMiddleware,
  attachDbUser,
  recruitmentStatusController.list,
);
router.put(
  '/:id/recruitment-statuses',
  authMiddleware,
  attachDbUser,
  recruitmentStatusController.sync,
);

router.get(
  '/:id/pipelines',
  authMiddleware,
  attachDbUser,
  clientPipelineController.list,
);
router.put(
  '/:id/pipelines',
  authMiddleware,
  attachDbUser,
  clientPipelineController.sync,
);
router.post(
  '/:id/pipelines',
  authMiddleware,
  attachDbUser,
  clientPipelineController.create,
);

router.get(
  '/:id/health-rules',
  authMiddleware,
  attachDbUser,
  clientHealthRuleController.list,
);
router.put(
  '/:id/health-rules',
  authMiddleware,
  attachDbUser,
  clientHealthRuleController.sync,
);
router.get(
  '/:id/health-pulse',
  authMiddleware,
  attachDbUser,
  clientHealthRuleController.pulse,
);

router.get(
  '/:id/job-health-rules',
  authMiddleware,
  attachDbUser,
  jobHealthRuleController.list,
);
router.put(
  '/:id/job-health-rules',
  authMiddleware,
  attachDbUser,
  jobHealthRuleController.sync,
);
router.get(
  '/:id/job-health-pulse',
  authMiddleware,
  attachDbUser,
  jobHealthRuleController.pulse,
);

router.get(
  '/:id/recruitment-sources',
  authMiddleware,
  attachDbUser,
  recruitmentSourceController.list,
);
router.post(
  '/:id/recruitment-sources',
  authMiddleware,
  attachDbUser,
  recruitmentSourceController.create,
);
router.put(
  '/:id/recruitment-sources/:sourceId',
  authMiddleware,
  attachDbUser,
  recruitmentSourceController.update,
);
router.delete(
  '/:id/recruitment-sources/:sourceId',
  authMiddleware,
  attachDbUser,
  recruitmentSourceController.remove,
);

router.get('/:id/insights', authMiddleware, attachDbUser, clientController.getInsights);
router.get('/:id', clientController.get);
router.post('/', optionalAuth, optionalAttachDbUser, clientController.create);
router.put('/:id', optionalAuth, optionalAttachDbUser, clientController.update);
router.delete('/:id', optionalAuth, optionalAttachDbUser, clientController.remove);

module.exports = router;

