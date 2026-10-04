const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { stringQueryOnly } = require('../middlewares/validateRequest');
const controller = require('../controllers/catalogDirectory.controller');

const router = Router();

// The whole medicine list for the phone to keep: a pharmacist browsing and
// searching with no connection, a warehouse looking one up.
router.get('/directory', authenticate, authorize('pharmacy', 'warehouse'), requireActiveStatus, stringQueryOnly, controller.directory);

module.exports = router;
