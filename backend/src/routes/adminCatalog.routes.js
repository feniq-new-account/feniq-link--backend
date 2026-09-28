const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { stringQueryOnly, objectIdParam } = require('../middlewares/validateRequest');
const { catalogImportUpload, singleImageUpload } = require('../middlewares/upload.middleware');
const controller = require('../controllers/adminCatalog.controller');

const router = Router();

router.use(authenticate, authorize('admin'), stringQueryOnly);
// Catalog overhaul Phase 11 (L1): malformed ids and query values are 400s.
router.param('id', objectIdParam);

// Static paths first, then the /:id-shaped ones.
router.get('/template', controller.downloadTemplate);
router.get('/field-forms', controller.downloadFieldForms);
// Backs the Searchable Dropdown manufacturer filter on both this page and
// Admin Products.
router.get('/manufacturers', controller.searchManufacturers);
// Catalog requests raised by warehouses from import rows (catalog overhaul
// Phase 5.1).
router.get('/requests', controller.listRequests);
router.post('/requests/:id/approve', controller.approveRequest);
router.post('/requests/:id/merge', controller.mergeRequest);
router.post('/requests/:id/reject', controller.rejectRequest);
// Duplicate groups the dedupe migration could not merge on its own (5.2).
router.get('/duplicates', controller.listDuplicates);
router.post('/duplicates/:id/resolve', controller.resolveDuplicate);
router.get('/', controller.list);
router.post('/import', catalogImportUpload, controller.importExcel);
router.patch('/:id', controller.update);
router.delete('/:id', controller.deactivate);
// The central image (5.3).
router.post('/:id/image', singleImageUpload, controller.uploadImage);
router.delete('/:id/image', controller.clearImage);

module.exports = router;
