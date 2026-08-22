const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  push,
  pushTest,
  pushHealth,
  unifiedPushTestDirect,
  registerUnifiedPush,
  unregisterUnifiedPush,
} = require('../controllers/pushController');

// POST /push/register
router.post('/push/register', authMiddleware, push)
// POST /push/test
router.post('/push/test', authMiddleware, pushTest)
// GET /push/health
router.get('/push/health', authMiddleware, pushHealth)
// POST /push/unified/test-direct
router.post('/push/unified/test-direct', authMiddleware, unifiedPushTestDirect)
// POST /push/unified/register
router.post('/push/unified/register', authMiddleware, registerUnifiedPush)
// POST /push/unified/unregister
router.post('/push/unified/unregister', authMiddleware, unregisterUnifiedPush)


module.exports = router;
