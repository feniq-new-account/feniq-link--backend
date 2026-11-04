const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/warehousePayment.controller');

const router = Router();

// Basic recording and documented reversal remain available in freemium.
// The controller/service still require an accountant and enforce tenant scope.
router.use(authenticate, authorize('warehouse'), requireActiveStatus);

// Money-Flow V2: payments are append-only. The V1 PATCH (edit) and DELETE
// routes are gone - a mistake is corrected by posting a reversal, which keeps
// both the original and the correction in the history. See payment.service.js.
router.post('/', controller.create);
router.post('/:id/reverse', controller.reverse);

module.exports = router;
