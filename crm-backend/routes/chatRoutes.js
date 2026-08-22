// routes/chatRoutes.js

const express = require('express');
const router = express.Router();
const {
  getChatHistory,
  saveChatMessage,
  sendFormToChat,
  sendTakeNotification,
  getChatSummary,
  updateFormToChat,
  getConsultAccessForApp,
  listConsultUsersForAdmin,
  updateConsultUsersForAdmin,
} = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');


router.get('/chat', authMiddleware, getChatHistory);
router.post('/chat', authMiddleware, saveChatMessage);
router.post('/notifications/send-to-chat', authMiddleware, sendFormToChat);
router.post('/notifications/send-notification', sendTakeNotification);
router.get('/chat-summary', authMiddleware, getChatSummary);
router.put('/notifications/update-send-to-chat', authMiddleware, updateFormToChat);
router.get('/app/consult/access', authMiddleware, getConsultAccessForApp);
router.get('/admin/consult/users', authMiddleware, listConsultUsersForAdmin);
router.put('/admin/consult/users', authMiddleware, updateConsultUsersForAdmin);


module.exports = router;
