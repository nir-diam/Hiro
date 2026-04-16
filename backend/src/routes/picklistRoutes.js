const express = require('express');
const picklistController = require('../controllers/picklistController');

const router = express.Router();

router.get('/categories', picklistController.listCategories);
router.get('/categories/by-key/:key/values', picklistController.listValuesByCategoryKey);
router.post('/categories', picklistController.createCategory);
router.put('/categories/:id', picklistController.updateCategory);
router.delete('/categories/:id', picklistController.deleteCategory);

router.get('/categories/:categoryId/subcategories', picklistController.listSubcategories);
router.post('/categories/:categoryId/subcategories', picklistController.createSubcategory);
router.put('/subcategories/:id', picklistController.updateSubcategory);
router.delete('/subcategories/:id', picklistController.deleteSubcategory);

router.get('/categories/:categoryId/values', picklistController.listCategoryValues);
router.post('/categories/:categoryId/values', picklistController.createCategoryValue);
router.put('/categories/:categoryId/values/:valueId', picklistController.updateCategoryValue);
router.delete('/categories/:categoryId/values/:valueId', picklistController.deleteCategoryValue);

router.get('/categories/:categoryId/subcategories/:subcategoryId/domains', picklistController.listDomains);
router.post('/categories/:categoryId/subcategories/:subcategoryId/domains', picklistController.createDomainValue);
router.put('/domains/:valueId', picklistController.updateDomainValue);
router.delete('/domains/:valueId', picklistController.deleteDomainValue);

module.exports = router;

