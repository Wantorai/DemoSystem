const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  acceptCall,
  endCall,
  getActiveCall,
  getCall,
  rejectCall,
  startCall,
  tokenForCall,
} = require('../controllers/employeeCallController');

const router = express.Router();

router.post('/calls', authMiddleware, startCall);
router.get('/calls/active', authMiddleware, getActiveCall);
router.get('/calls/:callId', authMiddleware, getCall);
router.post('/calls/:callId/accept', authMiddleware, acceptCall);
router.post('/calls/:callId/reject', authMiddleware, rejectCall);
router.post('/calls/:callId/end', authMiddleware, endCall);
router.post('/calls/:callId/token', authMiddleware, tokenForCall);

module.exports = router;
