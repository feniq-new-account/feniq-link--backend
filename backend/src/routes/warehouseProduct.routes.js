const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { catalogImportUpload, singleImageUpload } = require('../middlewares/upload.middleware');
const controller = require('../controllers/warehouseProduct.controller');

const router = Router();

router.use(authenticate, authorize('warehouse'), requireActiveStatus);

router.get('/template', controller.downloadTemplate);
router.get('/search', controller.search);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/import', catalogImportUpload, controller.importExcel);
// The import results page (catalog overhaul Phase 4.6).
router.get('/imports', controller.listImports);
router.get('/imports/:batchId', controller.getImport);
router.get('/imports/:batchId/rows', controller.listImportRows);
router.post('/imports/:batchId/rows/:rowId/resolve', controller.resolveImportRow);
router.post('/imports/:batchId/rows/:rowId/request', controller.requestCatalogItem);
router.patch('/:id', controller.update);
// The warehouse's override image (catalog overhaul Phase 9, Cloudinary only).
router.post('/:id/image', singleImageUpload, controller.uploadImage);

module.exports = router;
