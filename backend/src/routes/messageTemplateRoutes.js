const express = require('express');
const messageTemplateController = require('../controllers/messageTemplateController');
const { authMiddleware, attachDbUser, requirePagePermission } = require('../middleware/permissionMiddleware');

const clientRouter = express.Router();
clientRouter.get('/for-compose', authMiddleware, attachDbUser, messageTemplateController.listForCompose);
clientRouter.use(authMiddleware, requirePagePermission('page:settings'));
clientRouter.get('/', messageTemplateController.listClient);
clientRouter.post('/', messageTemplateController.createClient);
clientRouter.put('/:id', messageTemplateController.updateClient);
clientRouter.delete('/:id', messageTemplateController.removeClient);

const adminRouter = express.Router();
adminRouter.use(authMiddleware, requirePagePermission('page:admin'));
adminRouter.get('/catalog', messageTemplateController.listCatalog);
adminRouter.post('/catalog', messageTemplateController.createCatalog);
adminRouter.put('/catalog/:id', messageTemplateController.updateCatalog);
adminRouter.delete('/catalog/:id', messageTemplateController.removeCatalog);
adminRouter.get('/', messageTemplateController.listAdmin);
adminRouter.post('/', messageTemplateController.createAdmin);
adminRouter.put('/:id', messageTemplateController.updateAdmin);
adminRouter.delete('/:id', messageTemplateController.removeAdmin);

module.exports = { clientRouter, adminRouter };
