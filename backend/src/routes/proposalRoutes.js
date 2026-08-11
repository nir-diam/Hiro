const express = require('express');
const proposalController = require('../controllers/proposalController');
const authMiddleware = require('../middleware/authMiddleware');
const { attachDbUser } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware, attachDbUser);

router.get('/templates', proposalController.listTemplates);
router.post('/templates', proposalController.createTemplate);
router.put('/templates/:id', proposalController.updateTemplate);
router.delete('/templates/:id', proposalController.removeTemplate);

router.get('/', proposalController.listProposals);
router.get('/:id', proposalController.getProposal);
router.post('/', proposalController.createProposal);
router.put('/:id', proposalController.updateProposal);
router.delete('/:id', proposalController.removeProposal);

module.exports = router;
