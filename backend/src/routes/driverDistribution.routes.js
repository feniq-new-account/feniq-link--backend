const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/distributionTrip.controller');
const liveLocation = require('../controllers/distributionLiveLocation.controller');
const router = Router();

// Existing rep credentials are the non-financial pilot driver identity.
// A rep can ONLY see trips explicitly assigned to their user id.
router.use(authenticate, authorize('rep'), requireActiveStatus);
router.get('/trips', controller.driverList);
router.get('/trips/:id', controller.driverDetail);
router.put('/trips/:id/location', liveLocation.update);
router.post('/trips/:id/start', controller.driverStart);
router.patch('/trips/:id/stops/:stopId', controller.driverStop);
router.post('/trips/:id/complete', controller.driverComplete);
module.exports = router;
