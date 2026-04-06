const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { attachDbUser } = require('../middleware/permissionMiddleware');
const clientController = require('../controllers/clientController');
const clientUsageSettingController = require('../controllers/clientUsageSettingController');
const clientContactController = require('../controllers/clientContactController');
const clientTaskController = require('../controllers/clientTaskController');
const clientEventController = require('../controllers/clientEventController');
const clientDocumentController = require('../controllers/clientDocumentController');
const clientFinanceController = require('../controllers/clientFinanceController');

const router = express.Router();

router.get('/', clientController.list);
router.get('/all-contacts', clientContactController.listAll);
router.get('/all-tasks', clientTaskController.listAll);
router.get('/:id/contacts', clientContactController.list);
router.post('/:id/contacts', clientContactController.create);
router.put('/:id/contacts/:contactId', clientContactController.update);
router.delete('/:id/contacts/:contactId', clientContactController.remove);

router.get('/:id/contact-groups', clientContactController.listGroups);
router.post('/:id/contact-groups', clientContactController.createGroup);
router.delete('/:id/contact-groups/:groupId', clientContactController.deleteGroup);

router.get('/:id/tasks', clientTaskController.list);
router.post('/:id/tasks', clientTaskController.create);
router.put('/:id/tasks/:taskId', clientTaskController.update);
router.delete('/:id/tasks/:taskId', clientTaskController.remove);

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

router.get('/:id', clientController.get);
router.post('/', clientController.create);
router.put('/:id', clientController.update);
router.delete('/:id', clientController.remove);

module.exports = router;

