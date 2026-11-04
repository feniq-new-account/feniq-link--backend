const { Router } = require('express');
const mongoose = require('mongoose');
const { isReady } = require('../utils/startupReadiness');

const router = Router();

router.get('/', (req, res) => {
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const ready = isReady();
  res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'Feniq API is ready.' : 'Feniq API is not ready.',
    db: dbStates[mongoose.connection.readyState] || 'unknown',
    time: new Date().toISOString(),
  });
});

module.exports = router;
