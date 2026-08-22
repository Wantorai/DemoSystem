'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
  listMyScheduledMessages,
  createScheduledRoomMessage,
  listScheduledRoomMessages,
  updateScheduledRoomMessage,
  cancelScheduledRoomMessage,
  sendScheduledRoomMessageNow,
  createScheduledBossMessage,
  listScheduledBossMessages,
  updateScheduledBossMessage,
  cancelScheduledBossMessage,
  sendScheduledBossMessageNow,
} = require('../controllers/scheduledMessageController');

router.get('/admin/messages/scheduled', auth, listMyScheduledMessages);

router.post('/admin/rooms/:roomId/messages/scheduled', auth, createScheduledRoomMessage);
router.get('/admin/rooms/:roomId/messages/scheduled', auth, listScheduledRoomMessages);
router.patch('/admin/rooms/:roomId/messages/scheduled/:scheduledId', auth, updateScheduledRoomMessage);
router.delete('/admin/rooms/:roomId/messages/scheduled/:scheduledId', auth, cancelScheduledRoomMessage);
router.post('/admin/rooms/:roomId/messages/scheduled/:scheduledId/send-now', auth, sendScheduledRoomMessageNow);

router.post('/admin/boss/chats/:chatId/messages/scheduled', auth, createScheduledBossMessage);
router.get('/admin/boss/chats/:chatId/messages/scheduled', auth, listScheduledBossMessages);
router.patch('/admin/boss/chats/:chatId/messages/scheduled/:scheduledId', auth, updateScheduledBossMessage);
router.delete('/admin/boss/chats/:chatId/messages/scheduled/:scheduledId', auth, cancelScheduledBossMessage);
router.post('/admin/boss/chats/:chatId/messages/scheduled/:scheduledId/send-now', auth, sendScheduledBossMessageNow);

module.exports = router;
