const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/distributionTrip.controller');
const liveLocation = require('../controllers/distributionLiveLocation.controller');

const router = Router();
router.use(authenticate, authorize('admin'));
router.get('/drivers', controller.listDrivers);
router.get('/trips', controller.list);
router.post('/trips', controller.create);
router.get('/trips/:id', controller.detail);
router.get('/trips/:id/location', liveLocation.readForAdmin);
router.put('/trips/:id/route', controller.configureRoute);
router.post('/trips/:id/assign-driver', controller.assign);
router.post('/trips/:id/start', controller.start);
router.patch('/trips/:id/stops/:stopId', controller.stop);
router.post('/trips/:id/complete', controller.complete);
router.post('/trips/:id/cancel', controller.cancel);
module.exports = router;
