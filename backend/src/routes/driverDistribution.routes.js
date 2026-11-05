const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/distributionTrip.controller');
const liveLocation = require('../controllers/distributionLiveLocation.controller');
const router = Router();

// Drivers and pilot reps may operate ONLY trips assigned to their user id.
// External drivers cannot access the general rep/warehouse APIs.
router.use(authenticate, authorize('rep', 'driver'), requireActiveStatus);
router.get('/trips', controller.driverList);
router.get('/trips/:id', controller.driverDetail);
router.put('/trips/:id/location', liveLocation.update);
router.post('/trips/:id/start', controller.driverStart);
router.patch('/trips/:id/stops/:stopId', controller.driverStop);
router.post('/trips/:id/complete', controller.driverComplete);
module.exports = router;
