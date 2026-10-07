const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/pharmacyVisitCode.controller');

const router = Router();

router.get('/', authenticate, authorize('pharmacy'), requireActiveStatus, controller.show);

module.exports = router;
